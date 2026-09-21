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

const DEFAULT_BASE_URL = "https://api.quickintel.io";

/**
 * Which header carries the key.
 *
 * The native API documents one name, while a key issued through the
 * developer portal's gateway is commonly a bearer token instead — and the
 * authentication page is not reachable from here to settle it. Rather
 * than burn a deploy cycle on a guess, the variants are tried in order
 * against the same vendor host and the one that answers is pinned.
 * QUICKINTEL_AUTH_HEADER pins it explicitly and skips the probing.
 */
const AUTH_HEADER_VARIANTS = ["X-QKNTL-KEY", "apikey", "Authorization"];

function authHeader(name: string, key: string): Record<string, string> {
  return { [name]: name === "Authorization" ? `Bearer ${key}` : key };
}

/** Pinned for the process once a variant answers. */
let pinnedHeader: string | null = null;

export function resolvedQuickIntelHeader(): string | null {
  return pinnedHeader;
}

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

  const configuredHeader = process.env.QUICKINTEL_AUTH_HEADER?.trim();
  const variants = configuredHeader
    ? [configuredHeader]
    : pinnedHeader
      ? [pinnedHeader]
      : AUTH_HEADER_VARIANTS;

  const endpoint = `${base}/v1/getquickiauditfull`;
  let payload: unknown;

  for (const variant of variants) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          ...authHeader(variant, key),
        },
        body: JSON.stringify({ chain, tokenAddress: token }),
      });

      // A rejected key looks like 401/403 — try the next spelling rather
      // than report the token as unaudited.
      if (!res.ok) continue;

      payload = await res.json();
      pinnedHeader = variant;
      break;
    } catch {
      continue;
    } finally {
      clearTimeout(timer);
    }
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
