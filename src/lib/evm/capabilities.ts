import { toFunctionSelector } from "viem";
import type { BytecodeProfile } from "./bytecode";
import type { Severity } from "./types";

/**
 * What privileged powers a token contract exposes, derived from the
 * function selectors present in its bytecode.
 *
 * The registry is declarative on purpose: covering a newly popular scam
 * pattern should be one added signature string, not new logic. Selectors
 * are derived from the signatures at module load rather than hardcoded,
 * so a typo becomes a wrong-but-consistent hash instead of a silently
 * mismatched constant nobody re-checks.
 *
 * A caveat that belongs in every reading of this output: a selector being
 * present proves the entry point exists, not that it is reachable by
 * anyone in particular. Absence is the stronger signal of the two.
 */
export type CapabilityId =
  | "mint"
  | "burn-any"
  | "pause"
  | "blacklist"
  | "whitelist-gate"
  | "fee-control"
  | "limit-control"
  | "upgrade"
  | "role-admin"
  | "ownership";

export interface CapabilityDefinition {
  id: CapabilityId;
  label: string;
  /** What it means for someone holding the token. */
  meaning: string;
  severity: Severity;
  signatures: readonly string[];
}

export const CAPABILITY_REGISTRY: readonly CapabilityDefinition[] = [
  {
    id: "mint",
    label: "Can mint new tokens",
    meaning:
      "Supply is not fixed. Whoever holds the privileged role can create new tokens and dilute every existing holder.",
    severity: "high",
    signatures: [
      "mint(address,uint256)",
      "mint(uint256)",
      "mint(address)",
      "mintTo(address,uint256)",
      "issue(uint256)",
      "createTokens(uint256)",
    ],
  },
  {
    id: "burn-any",
    label: "Can burn tokens from any wallet",
    meaning:
      "A privileged caller can destroy tokens held by someone else, without that holder approving it.",
    severity: "high",
    signatures: ["burn(address,uint256)", "burnFrom(address,uint256)"],
  },
  {
    id: "pause",
    label: "Transfers can be paused",
    meaning:
      "All transfers can be halted on demand. While paused you cannot sell or move the token.",
    severity: "high",
    signatures: [
      "pause()",
      "unpause()",
      "setPaused(bool)",
      "pauseTrading()",
      "setTradingEnabled(bool)",
      "enableTrading()",
    ],
  },
  {
    id: "blacklist",
    label: "Wallets can be blacklisted",
    meaning:
      "Specific addresses can be blocked from transferring. A blacklisted holder is left unable to sell.",
    severity: "critical",
    signatures: [
      "blacklist(address)",
      "blacklist(address,bool)",
      "setBlacklist(address,bool)",
      "setBlackList(address,bool)",
      "setBlacklisted(address,bool)",
      "addToBlacklist(address)",
      "addBlacklist(address)",
      "removeFromBlacklist(address)",
      "isBlacklisted(address)",
      "blockAccount(address)",
      "setBotBlacklist(address,bool)",
    ],
  },
  {
    id: "whitelist-gate",
    label: "Transfers can be whitelist-gated",
    meaning:
      "The contract can restrict transfers to an approved list of addresses, which is one way a token is made buyable but not sellable.",
    severity: "medium",
    signatures: [
      "setWhitelist(address,bool)",
      "addToWhitelist(address)",
      "setWhitelistEnabled(bool)",
    ],
  },
  {
    id: "fee-control",
    label: "Transfer fees can be changed",
    meaning:
      "The buy/sell fee is adjustable after launch. A fee that can be raised to near 100% is a sell block in all but name.",
    severity: "high",
    signatures: [
      "setFee(uint256)",
      "setFees(uint256,uint256)",
      "setFees(uint256,uint256,uint256)",
      "setTaxes(uint256,uint256)",
      "setBuyTax(uint256)",
      "setSellTax(uint256)",
      "setTaxFee(uint256)",
      "setTotalFee(uint256)",
      "setFeePercent(uint256)",
      "setMarketingFee(uint256)",
      "setLiquidityFee(uint256)",
    ],
  },
  {
    id: "limit-control",
    label: "Transaction and wallet limits can be changed",
    meaning:
      "Maximum transaction or wallet size can be adjusted, which can be tightened to stop holders exiting at size.",
    severity: "medium",
    signatures: [
      "setMaxTxAmount(uint256)",
      "setMaxTxPercent(uint256)",
      "setMaxWallet(uint256)",
      "setMaxWalletAmount(uint256)",
      "setMaxWalletPercent(uint256)",
    ],
  },
  {
    id: "upgrade",
    label: "Contract logic can be replaced",
    meaning:
      "The code behind this token can be swapped for different code. Anything you verified today can be changed tomorrow.",
    severity: "critical",
    signatures: ["upgradeTo(address)", "upgradeToAndCall(address,bytes)"],
  },
  {
    id: "role-admin",
    label: "Role-based admin control",
    meaning:
      "Privileges are handed out by role rather than a single owner, so a renounced owner does not necessarily mean nobody is in control.",
    severity: "info",
    signatures: [
      "grantRole(bytes32,address)",
      "revokeRole(bytes32,address)",
      "hasRole(bytes32,address)",
    ],
  },
  {
    id: "ownership",
    label: "Has a contract owner",
    meaning:
      "The contract exposes an owner, which is normal — what matters is whether that owner is still active and what powers it has.",
    severity: "info",
    signatures: [
      "owner()",
      "getOwner()",
      "transferOwnership(address)",
      "renounceOwnership()",
    ],
  },
];

/** Minimal ERC-20 surface — used to decide whether this is a token at all. */
export const ERC20_REQUIRED_SIGNATURES = [
  "totalSupply()",
  "balanceOf(address)",
  "transfer(address,uint256)",
] as const;

export const ERC20_EXPECTED_SIGNATURES = [
  ...ERC20_REQUIRED_SIGNATURES,
  "transferFrom(address,address,uint256)",
  "approve(address,uint256)",
  "allowance(address,address)",
] as const;

function selectorMap(signatures: readonly string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const signature of signatures) {
    map.set(toFunctionSelector(signature), signature);
  }
  return map;
}

const CAPABILITY_SELECTORS = CAPABILITY_REGISTRY.map((definition) => ({
  definition,
  selectors: selectorMap(definition.signatures),
}));

const ERC20_SELECTORS = selectorMap(ERC20_EXPECTED_SIGNATURES);
const ERC20_REQUIRED_SELECTORS = selectorMap(ERC20_REQUIRED_SIGNATURES);

export interface DetectedCapability {
  definition: CapabilityDefinition;
  /** Human-readable signatures that matched, for the evidence line. */
  matched: string[];
}

export function detectCapabilities(
  profile: BytecodeProfile
): DetectedCapability[] {
  const detected: DetectedCapability[] = [];

  for (const { definition, selectors } of CAPABILITY_SELECTORS) {
    const matched: string[] = [];
    for (const [selector, signature] of selectors) {
      if (profile.selectors.has(selector)) matched.push(signature);
    }
    if (matched.length > 0) detected.push({ definition, matched });
  }

  return detected;
}

export interface Erc20SurfaceCheck {
  /** Standard functions found in the bytecode. */
  present: string[];
  /** Standard functions with no matching selector. */
  missing: string[];
  /** Whether the bare minimum to behave like a token is there. */
  looksLikeErc20: boolean;
}

export function checkErc20Surface(profile: BytecodeProfile): Erc20SurfaceCheck {
  const present: string[] = [];
  const missing: string[] = [];

  for (const [selector, signature] of ERC20_SELECTORS) {
    if (profile.selectors.has(selector)) present.push(signature);
    else missing.push(signature);
  }

  const looksLikeErc20 = [...ERC20_REQUIRED_SELECTORS.keys()].every((selector) =>
    profile.selectors.has(selector)
  );

  return { present, missing, looksLikeErc20 };
}
