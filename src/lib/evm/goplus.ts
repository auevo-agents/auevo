import type { Address } from "viem";
import { ROBINHOOD_CHAIN_ID } from "../chains";
import { decimalOrNull, fetchJson, triState } from "./http";

/**
 * GoPlus Token Security — the established scanner, used as a second
 * opinion on Robinhood Chain.
 *
 * It sees things bytecode analysis cannot: it simulates a buy and a sell,
 * so it can answer "does this token actually let you out" and "what is
 * the real tax", which is the question our static analysis explicitly
 * cannot answer.
 *
 * Two rules govern how its answers are used, both in `token-security.ts`:
 * its findings can only add risk or close a coverage gap, never remove a
 * finding we derived from the contract ourselves; and a field it omits is
 * unknown, not clean. On this chain most tax fields come back empty, so
 * that second rule is the difference between an honest report and a
 * reassuring one.
 */

const DEFAULT_BASE_URL = "https://api.gopluslabs.io";

function baseUrl(): string | null {
  const configured = process.env.GOPLUS_API_URL?.trim();
  // An explicit empty value is how you turn the source off.
  if (configured === "") return null;
  return (configured || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

interface GoPlusEnvelope {
  code?: number;
  message?: string;
  result?: Record<string, Record<string, unknown>>;
}

export interface GoPlusReport {
  /** Sell simulation failed — you can buy but not sell. */
  isHoneypot: boolean | null;
  cannotSellAll: boolean | null;
  transferPausable: boolean | null;
  isMintable: boolean | null;
  isBlacklisted: boolean | null;
  isWhitelisted: boolean | null;
  slippageModifiable: boolean | null;
  hiddenOwner: boolean | null;
  canTakeBackOwnership: boolean | null;
  selfdestruct: boolean | null;
  isOpenSource: boolean | null;
  isProxy: boolean | null;
  tradingCooldown: boolean | null;
  antiWhaleModifiable: boolean | null;
  /** Fractions, not percentages: 0.05 is a 5% tax. */
  buyTax: number | null;
  sellTax: number | null;
  holderCount: number | null;
  creatorPercent: number | null;
  ownerPercent: number | null;
  lpHolderCount: number | null;
  isInDex: boolean | null;
  /** Percent of LP supply sitting at a burn address, 0-100. */
  lpBurnedPercent: number | null;
  /** Percent of LP supply held in a recognised lock contract, 0-100. */
  lpLockedPercent: number | null;
}

/** Addresses whose LP balance is out of circulation, not someone's position. */
const BURN_ADDRESSES = new Set([
  "0x000000000000000000000000000000000000dead",
  "0x0000000000000000000000000000000000000000",
  "0x0000000000000000000000000000000000000001",
]);

/**
 * GoPlus reports the LP token's own holder list in the same response as
 * everything else here — same call, no extra round trip. Each holder
 * carries `is_locked`, which GoPlus sets from a small set of recognised
 * lock contracts; it is a real signal but not exhaustive, so this can
 * under-count a lock done through a contract GoPlus does not recognise.
 * A burned share (sent to a dead address) is unambiguous by contrast, so
 * it is read from the address itself rather than trusted to a flag.
 */
function parseLpDistribution(entry: Record<string, unknown>): {
  burnedPercent: number | null;
  lockedPercent: number | null;
} {
  const holders = entry.lp_holders;
  if (!Array.isArray(holders) || holders.length === 0) {
    return { burnedPercent: null, lockedPercent: null };
  }

  let burned = 0;
  let locked = 0;
  let sawAny = false;

  for (const raw of holders) {
    if (!raw || typeof raw !== "object") continue;
    const holder = raw as Record<string, unknown>;

    const fraction = decimalOrNull(holder.percent as string);
    if (fraction === null) continue;
    sawAny = true;

    const address =
      typeof holder.address === "string" ? holder.address.toLowerCase() : "";
    const percent = fraction * 100;

    if (BURN_ADDRESSES.has(address)) burned += percent;
    else if (triState(holder.is_locked) === true) locked += percent;
  }

  return sawAny
    ? { burnedPercent: burned, lockedPercent: locked }
    : { burnedPercent: null, lockedPercent: null };
}

function toReportKeys(distribution: {
  burnedPercent: number | null;
  lockedPercent: number | null;
}): Pick<GoPlusReport, "lpBurnedPercent" | "lpLockedPercent"> {
  return {
    lpBurnedPercent: distribution.burnedPercent,
    lpLockedPercent: distribution.lockedPercent,
  };
}

function intOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export async function fetchGoPlus(
  token: Address
): Promise<GoPlusReport | null> {
  const base = baseUrl();
  if (!base) return null;

  const url = `${base}/api/v1/token_security/${ROBINHOOD_CHAIN_ID}?contract_addresses=${token}`;
  const envelope = await fetchJson<GoPlusEnvelope>(url, 8_000);

  if (!envelope || envelope.code !== 1 || !envelope.result) return null;

  // The result is keyed by the address, and the API lowercases it.
  const entry =
    envelope.result[token.toLowerCase()] ??
    Object.values(envelope.result).find(
      (value) => value && typeof value === "object"
    );

  if (!entry) return null;

  return {
    isHoneypot: triState(entry.is_honeypot),
    cannotSellAll: triState(entry.cannot_sell_all),
    transferPausable: triState(entry.transfer_pausable),
    isMintable: triState(entry.is_mintable),
    isBlacklisted: triState(entry.is_blacklisted),
    isWhitelisted: triState(entry.is_whitelisted),
    slippageModifiable: triState(entry.slippage_modifiable),
    hiddenOwner: triState(entry.hidden_owner),
    canTakeBackOwnership: triState(entry.can_take_back_ownership),
    selfdestruct: triState(entry.selfdestruct),
    isOpenSource: triState(entry.is_open_source),
    isProxy: triState(entry.is_proxy),
    tradingCooldown: triState(entry.trading_cooldown),
    antiWhaleModifiable: triState(entry.anti_whale_modifiable),
    buyTax: decimalOrNull(entry.buy_tax),
    sellTax: decimalOrNull(entry.sell_tax),
    holderCount: intOrNull(entry.holder_count),
    creatorPercent: decimalOrNull(entry.creator_percent),
    ownerPercent: decimalOrNull(entry.owner_percent),
    lpHolderCount: intOrNull(entry.lp_holder_count),
    isInDex: triState(entry.is_in_dex),
    ...toReportKeys(parseLpDistribution(entry)),
  };
}
