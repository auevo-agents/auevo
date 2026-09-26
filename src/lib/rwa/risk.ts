import { decodeAbiParameters, encodeAbiParameters, hexToBigInt, keccak256, size, toBytes, toFunctionSelector, type Address, type Hex } from "viem";
import type { EvmReadClient } from "@/lib/evm/client";
import { isEmptyCode, profileBytecode, type BytecodeProfile } from "@/lib/evm/bytecode";
import { detectCapabilities, type CapabilityDefinition, type CapabilityId } from "@/lib/evm/capabilities";
import { detectProxy, type ProxyInfo } from "@/lib/evm/proxy";
import { readOwner } from "@/lib/evm/erc20";
import { getEvmClient } from "./evm-clients";

/**
 * RWA_SPEC.md Phase 5's risk scoring — "админ прокси (EIP-1967), роли
 * (AccessControl hasRole, owner), селекторы pause/blacklist/freeze/
 * forceTransfer/burnFrom/mint, кто держит MINTER_ROLE. Формула прозрачная,
 * веса в конфиге." Explicitly framed by the spec as NOT a scam score:
 * "насколько эмитент может вмешаться в ваш токен" — a regulated,
 * issuer-backed stock token having pause/blacklist/freeze is often a
 * *compliance* feature (sanctions/freeze-order capability), not a red
 * flag the way it would be on an anonymous memecoin. This score is framed
 * that way throughout: "issuer intervention power", not "rug risk".
 *
 * Reuses the existing, already-tested memecoin-scanner primitives that are
 * genuinely chain/purpose-agnostic (profileBytecode, detectProxy,
 * detectCapabilities, readOwner — all pure bytecode/storage analysis with
 * nothing memecoin-specific about them) via the new EvmReadClient
 * interface (evm/client.ts), which works against any of the six chains in
 * rwa/lifi/chains.ts, not just Robinhood Chain.
 *
 * freeze()/forceTransfer() are NOT in evm/capabilities.ts's own
 * CAPABILITY_REGISTRY — that registry was built for memecoin rug patterns,
 * and adding compliance-hold verbs there would change the legacy fee
 * scanner's output for a concern it was never scoped to cover. Kept as a
 * small, separate, RWA-specific registry instead — same declarative shape,
 * deliberately not merged.
 */

const RWA_ONLY_CAPABILITIES: readonly CapabilityDefinition[] = [
  {
    id: "freeze" as CapabilityId,
    label: "Wallets can be frozen",
    meaning: "A specific address's balance can be frozen in place, separate from a blanket pause or blacklist. Common on regulated stablecoin-style tokens for sanctions/court-order compliance.",
    severity: "medium",
    signatures: ["freeze(address)", "unfreeze(address)", "isFrozen(address)", "freeze(address,bool)"],
  },
  {
    id: "force-transfer" as CapabilityId,
    label: "Tokens can be moved without the holder's approval",
    meaning: "A privileged caller can move tokens out of any wallet directly. On a regulated asset this is usually a recovery/compliance tool (e.g. reversing a mistaken or sanctioned transfer), not ordinary behavior.",
    severity: "high",
    signatures: ["forceTransfer(address,address,uint256)", "adminTransfer(address,address,uint256)", "seize(address,address)", "confiscate(address,uint256)"],
  },
];

/**
 * Weights sum to 100 so `score = 100 - sum(matched weights)` reads
 * directly as "how much of the issuer's possible intervention power is
 * present here" — the whole formula, no hidden curve. Not reused from the
 * legacy scanner's SEVERITY_PENALTY table: that table scores "is this a
 * scam", this scores "how much control does the issuer retain", a
 * different question with different weights (e.g. "has an owner" is
 * expected and unpenalized here, where the legacy scanner treats a
 * present-but-unrenounced owner as informational too, so the two happen
 * to agree there — but mint/upgrade are weighted far heavier here since
 * dilution/logic-swap is the specific concern for a tokenized security).
 */
export const RISK_WEIGHTS: Readonly<Record<string, number>> = {
  mint: 20,
  "force-transfer": 20,
  upgrade: 15,
  "burn-any": 15,
  pause: 10,
  blacklist: 10,
  freeze: 10,
};

const MINTER_ROLE: Hex = keccak256(toBytes("MINTER_ROLE")); // OpenZeppelin AccessControl convention: keccak256("MINTER_ROLE")
const MAX_ROLE_MEMBERS = 20; // sane cap — a real minter set this large would be its own finding, not something to enumerate forever

const GET_ROLE_MEMBER_COUNT_SELECTOR = toFunctionSelector("getRoleMemberCount(bytes32)");
const GET_ROLE_MEMBER_SELECTOR = toFunctionSelector("getRoleMember(bytes32,uint256)");

export interface RiskFinding {
  capabilityId: string;
  label: string;
  meaning: string;
  weight: number;
  matchedSignatures: string[];
}

export interface RiskResult {
  chainId: number;
  address: Address;
  isContract: boolean;
  proxy: ProxyInfo | null;
  /** The address whose bytecode was actually analyzed for capabilities — the implementation, for a proxy. */
  analyzedAddress: Address;
  adminAddress: Address | null;
  upgradeable: boolean;
  canMint: boolean;
  canPause: boolean;
  canBlacklist: boolean;
  canFreeze: boolean;
  canForceTransfer: boolean;
  canBurnOthers: boolean;
  /** null when the contract doesn't expose AccessControlEnumerable — not evidence there are no minters, just that this scan couldn't see them. */
  mintRoleHolders: Address[] | null;
  score: number;
  findings: RiskFinding[];
  checkedAt: string;
}

async function rawCall(client: EvmReadClient, to: Address, data: Hex): Promise<Hex | null> {
  try {
    const { data: result } = await client.call({ to, data });
    return result && result !== "0x" ? result : null;
  } catch {
    return null;
  }
}

/**
 * Enumerates MINTER_ROLE's members via AccessControlEnumerable, only when
 * the target's own bytecode shows both enumeration selectors — calling
 * getRoleMember blind on a contract that doesn't support it would just
 * revert or return garbage, which this treats the same as "not supported"
 * (null) rather than an empty holder list.
 */
async function readMinterRoleHolders(client: EvmReadClient, address: Address, profile: BytecodeProfile): Promise<Address[] | null> {
  if (!profile.selectors.has(GET_ROLE_MEMBER_COUNT_SELECTOR) || !profile.selectors.has(GET_ROLE_MEMBER_SELECTOR)) {
    return null;
  }

  const countRaw = await rawCall(client, address, `${GET_ROLE_MEMBER_COUNT_SELECTOR}${encodeAbiParameters([{ type: "bytes32" }], [MINTER_ROLE]).slice(2)}` as Hex);
  if (!countRaw || size(countRaw) < 32) return null;
  const count = Number(hexToBigInt(countRaw));
  if (!Number.isFinite(count) || count < 0) return null;

  const holders: Address[] = [];
  for (let i = 0; i < Math.min(count, MAX_ROLE_MEMBERS); i++) {
    const args = encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [MINTER_ROLE, BigInt(i)]).slice(2);
    const raw = await rawCall(client, address, `${GET_ROLE_MEMBER_SELECTOR}${args}` as Hex);
    if (!raw || size(raw) < 32) continue;
    try {
      const [holder] = decodeAbiParameters([{ type: "address" }], raw);
      holders.push(holder as Address);
    } catch {
      // Skip a slot that didn't decode rather than aborting the whole scan.
    }
  }
  return holders;
}

/**
 * Scans one token's contract for issuer-intervention capabilities.
 * Read-only: no writes, no funds touched, ever — this only ever calls
 * `eth_call`/`eth_getStorageAt`/`eth_getCode`.
 *
 * Takes the client as a parameter (same shape as rwa/dex/quote.ts's
 * quoteRoute) rather than looking it up internally, so tests can hand it a
 * scripted EvmReadClient with no network involved — see
 * scanTokenRiskByChain below for the real, chain-id-driven entry point.
 */
export async function scanTokenRisk(client: EvmReadClient, chainId: number, address: Address): Promise<RiskResult> {

  const checkedAt = new Date().toISOString();
  const code = await client.getCode({ address });

  if (isEmptyCode(code)) {
    return {
      chainId,
      address,
      isContract: false,
      proxy: null,
      analyzedAddress: address,
      adminAddress: null,
      upgradeable: false,
      canMint: false,
      canPause: false,
      canBlacklist: false,
      canFreeze: false,
      canForceTransfer: false,
      canBurnOthers: false,
      mintRoleHolders: null,
      score: 0,
      findings: [],
      checkedAt,
    };
  }

  const ownProfile = profileBytecode(code!);
  const proxy = await detectProxy(client, address, code!);

  let analyzedAddress = address;
  let analyzedProfile = ownProfile;
  if (proxy?.implementation) {
    const implCode = await client.getCode({ address: proxy.implementation });
    if (implCode && !isEmptyCode(implCode)) {
      analyzedAddress = proxy.implementation;
      analyzedProfile = profileBytecode(implCode);
    }
  }

  // detectCapabilities only knows the shared registry — matched separately
  // against the RWA-only registry and combined below, rather than teaching
  // the shared function about a second registry it has no other caller for.
  const rwaOnlyDetected = RWA_ONLY_CAPABILITIES.flatMap((definition) => {
    const matched = definition.signatures.filter((sig) => analyzedProfile.selectors.has(toFunctionSelector(sig)));
    return matched.length > 0 ? [{ definition, matched }] : [];
  });
  const allDetected = [...detectCapabilities(analyzedProfile), ...rwaOnlyDetected];

  const owner = await readOwner(client, address);
  const mintRoleHolders = await readMinterRoleHolders(client, address, analyzedProfile);

  const has = (id: string) => allDetected.some((d) => d.definition.id === id);

  // Upgradeability is scored from `proxy.upgradeable` OR a selector match,
  // not just the selector: a transparent (non-UUPS) EIP-1967 proxy keeps
  // upgradeTo() on the PROXY's own bytecode, not the implementation's,
  // which is the bytecode actually analyzed above — so selector detection
  // alone would miss that pattern entirely. `proxy.upgradeable` (set by
  // detectProxy from the storage-slot pattern itself) catches it either way.
  const upgradeFromSelectors = allDetected.find((d) => d.definition.id === "upgrade");
  const upgradeable = Boolean(proxy?.upgradeable) || Boolean(upgradeFromSelectors);

  const findings: RiskFinding[] = allDetected
    .filter((d) => d.definition.id in RISK_WEIGHTS && d.definition.id !== "upgrade")
    .map((d) => ({
      capabilityId: d.definition.id,
      label: d.definition.label,
      meaning: d.definition.meaning,
      weight: RISK_WEIGHTS[d.definition.id] ?? 0,
      matchedSignatures: d.matched,
    }));
  if (upgradeable) {
    findings.push({
      capabilityId: "upgrade",
      label: "Contract logic can be replaced",
      meaning: "The code behind this token can be swapped for different code — anything verified today can change tomorrow.",
      weight: RISK_WEIGHTS.upgrade,
      matchedSignatures: upgradeFromSelectors?.matched ?? (proxy ? [`${proxy.kind} proxy`] : []),
    });
  }

  const score = Math.max(0, 100 - findings.reduce((sum, f) => sum + f.weight, 0));

  return {
    chainId,
    address,
    isContract: true,
    proxy,
    analyzedAddress,
    adminAddress: proxy?.admin ?? owner?.owner ?? null,
    upgradeable,
    canMint: has("mint"),
    canPause: has("pause"),
    canBlacklist: has("blacklist"),
    canFreeze: has("freeze"),
    canForceTransfer: has("force-transfer"),
    canBurnOthers: has("burn-any"),
    mintRoleHolders,
    score,
    findings,
    checkedAt,
  };
}

/** Real entry point — looks up the right chain's RPC client, then scans. */
export async function scanTokenRiskByChain(chainId: number, address: Address): Promise<RiskResult> {
  const client = getEvmClient(chainId);
  if (!client) throw new Error(`No RPC client configured for chain ${chainId}`);
  return scanTokenRisk(client, chainId, address);
}
