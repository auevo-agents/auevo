import type { Address } from "viem";
import { decimalOrNull, triState } from "./http";

/**
 * Quick Intel — a third opinion, and the only source wired up that can
 * answer the question still listed as a standing limitation: whether the
 * liquidity behind a token is locked or burned.
 *
 * It is key-gated, so it stays off until QUICKINTEL_API_KEY is set. That
 * is deliberate: an unconfigured source is "not attempted" and shows as a
 * standing limitation, while a configured source that stays silent is a
 * gap that lowers confidence. The distinction keeps "confidence" meaning
 * how much of what we tried actually came back.
 *
 * Scope is narrow on purpose. Taxes are left to GoPlus, whose units are
 * known to be fractions; mixing in a second source whose unit convention
 * we cannot verify risks reporting a 0.5% tax as 50%, and a wrong number
 * here is worse than no number.
 */

// Confirmed against the vendor's own docs (Getting Started -> Authentication):
// base https://api.quickintel.io/v1, key on X-QKNTL-KEY. Their docs also
// flag that a missing or wrong key comes back as a 404 ("No data product
// found"), not a 401/403 — worth keeping in mind if this source ever
// starts reporting "unavailable" for what is actually a bad key.
const DEFAULT_BASE_URL = "https://api.quickintel.io/v1";
const AUTH_HEADER = "X-QKNTL-KEY";

export interface QuickIntelReport {
  isHoneypot: boolean | null;
  contractVerified: boolean | null;
  canMint: boolean | null;
  canBlacklist: boolean | null;
  canPauseTrading: boolean | null;
  hiddenOwner: boolean | null;
  /** Percent of LP tokens burned outright, 0-100. */
  lpBurnedPercent: number | null;
  /** Percent of LP tokens held in a lock contract, 0-100. */
  lpLockedPercent: number | null;
}

/** Reads the first key that is present — field spellings vary by version. */
function pick(source: unknown, ...keys: string[]): unknown {
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

/** A percentage that must land in 0-100 to be believed. */
function percentOrNull(value: unknown): number | null {
  const parsed =
    typeof value === "number" ? value : decimalOrNull(value as string);
  if (parsed === null || !Number.isFinite(parsed)) return null;
  return parsed >= 0 && parsed <= 100 ? parsed : null;
}

export function quickIntelConfigured(): boolean {
  return Boolean(process.env.QUICKINTEL_API_KEY?.trim());
}

export async function fetchQuickIntel(
  token: Address
): Promise<QuickIntelReport | null> {
  const key = process.env.QUICKINTEL_API_KEY?.trim();
  if (!key) return null;

  const base = (process.env.QUICKINTEL_API_URL?.trim() || DEFAULT_BASE_URL)
    .replace(/\/+$/, "");
  const chain = process.env.QUICKINTEL_CHAIN?.trim() || "robinhood";
  const authHeaderName = process.env.QUICKINTEL_AUTH_HEADER?.trim() || AUTH_HEADER;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  let payload: unknown;
  try {
    const res = await fetch(`${base}/getquickiauditfull`, {
      method: "POST",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        [authHeaderName]: key,
      },
      body: JSON.stringify({ chain, tokenAddress: token }),
    });

    // Per the vendor's docs, a missing/wrong key surfaces as a 404 here,
    // not 401/403 — this branch covers that case too, it just cannot
    // distinguish "bad key" from "token genuinely not found" without
    // reading the error body, and either way there is nothing to report.
    if (!res.ok) return null;
    payload = await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!payload || typeof payload !== "object") return null;

  const audit = pick(payload, "quickiAudit", "quickIAudit", "audit");
  const dynamic = pick(payload, "tokenDynamicDetails", "dynamicDetails");

  const report: QuickIntelReport = {
    isHoneypot: triState(
      pick(dynamic, "is_Honeypot", "isHoneypot") ??
        pick(audit, "is_Honeypot", "isHoneypot")
    ),
    contractVerified: triState(
      pick(audit, "contract_Verified", "contractVerified")
    ),
    canMint: triState(pick(audit, "can_Mint", "canMint")),
    canBlacklist: triState(pick(audit, "can_Blacklist", "canBlacklist")),
    canPauseTrading: triState(
      pick(audit, "can_Freeze_Trading", "can_Pause_Trading", "canPauseTrading")
    ),
    hiddenOwner: triState(pick(audit, "hidden_Owner", "hiddenOwner")),
    lpBurnedPercent: percentOrNull(
      pick(dynamic, "lp_Burned_Percent", "lpBurnedPercent")
    ),
    lpLockedPercent: percentOrNull(
      pick(dynamic, "lp_Locked_Percent", "lpLockedPercent")
    ),
  };

  // Every field unreadable means the shape is not what we expect — report
  // that as "no answer" rather than as a token with nothing to flag.
  const answered = Object.values(report).some((value) => value !== null);
  return answered ? report : null;
}
