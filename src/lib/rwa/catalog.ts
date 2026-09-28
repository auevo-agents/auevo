import { isPlausibleStockPriceUsd } from "./pools";

/**
 * Assembles the Assets catalog (RWA_SPEC.md Phase 3, /app/assets and
 * /app/assets/[ticker]) from rwa_underlyings/rwa_tokens/rwa_prices —
 * pure functions, no Supabase call here, so the assembly logic is
 * testable without a scripted server (the API routes that call this do
 * the actual fetching).
 *
 * HyperDex's own catalog (docs/RWA_SPEC.md section 2) ranks by 24h volume
 * ("Most Traded") and market cap ("Top Assets") — neither is available
 * yet (Phase 1's price cron doesn't populate liquidity/volume/mkt_cap,
 * see run-prices.ts's own note on why), so this only offers what the data
 * actually supports today: alphabetical, or "Most Available" (real,
 * derived from how many issuer/chain combinations actually exist for a
 * ticker) — RWA_SPEC.md section 2's own third HyperDex sort bucket, which
 * needs nothing this app doesn't already have.
 */

export interface AssetTokenRow {
  chainId: number;
  address: string;
  issuerId: string;
  symbol: string;
  decimals: number;
  priceUsd: number | null;
  premiumBps: number | null;
  priceAsOf: string | null;
  /** RWA_SPEC.md Phase 5's risk score (rwa/risk.ts) — null when the risk cron hasn't scanned this token yet, never guessed. */
  riskScore: number | null;
}

export interface AssetSummary {
  ticker: string;
  name: string;
  category: string;
  exchange: string | null;
  issuerCount: number;
  chainCount: number;
  tokenCount: number;
  /** The primary chain's own price if it has one, else the first token with a price, else null — never averaged or invented. */
  primaryPriceUsd: number | null;
  primaryPremiumBps: number | null;
  /** Same "primary chain, else first available" preference as price — the lowest score isn't used here, since this is a headline figure for one specific listing, not a worst-case across every issuer. */
  primaryRiskScore: number | null;
  tokens: AssetTokenRow[];
}

export interface UnderlyingInput {
  ticker: string;
  name: string;
  category: string;
  exchange: string | null;
}

export interface TokenInput {
  chainId: number;
  address: string;
  underlyingTicker: string;
  issuerId: string;
  symbol: string;
  decimals: number;
}

export interface LatestPrice {
  priceUsd: number | null;
  premiumBps: number | null;
  ts: string;
}

/** `rows` must already be ordered by `ts` descending — the first row seen for a (chainId, address) pair is kept as its latest snapshot. */
export function latestPricesByKey(
  rows: { chain_id: number; token_address: string; price_usd: number | null; premium_bps: number | null; ts: string }[]
): Map<string, LatestPrice> {
  const map = new Map<string, LatestPrice>();
  for (const r of rows) {
    const key = `${r.chain_id}:${r.token_address.toLowerCase()}`;
    if (!map.has(key)) {
      const priceUsd = r.price_usd !== null && isPlausibleStockPriceUsd(r.price_usd) ? r.price_usd : null;
      // An implausible price has nothing real to be "at a premium/discount
      // to" either — drop the premium alongside it rather than keep a
      // premium_bps computed against a price this app no longer trusts.
      const premiumBps = priceUsd !== null ? r.premium_bps : null;
      map.set(key, { priceUsd, premiumBps, ts: r.ts });
    }
  }
  return map;
}

export function buildAssetSummaries(
  underlyings: UnderlyingInput[],
  tokens: TokenInput[],
  latestPrices: Map<string, LatestPrice>,
  primaryChainId: number,
  riskScores: Map<string, number | null> = new Map()
): AssetSummary[] {
  const tokensByTicker = new Map<string, TokenInput[]>();
  for (const t of tokens) {
    const list = tokensByTicker.get(t.underlyingTicker) ?? [];
    list.push(t);
    tokensByTicker.set(t.underlyingTicker, list);
  }

  return underlyings.map((u) => {
    const tokenRows: AssetTokenRow[] = (tokensByTicker.get(u.ticker) ?? []).map((t) => {
      const key = `${t.chainId}:${t.address.toLowerCase()}`;
      const price = latestPrices.get(key);
      return {
        chainId: t.chainId,
        address: t.address,
        issuerId: t.issuerId,
        symbol: t.symbol,
        decimals: t.decimals,
        priceUsd: price?.priceUsd ?? null,
        premiumBps: price?.premiumBps ?? null,
        priceAsOf: price?.ts ?? null,
        riskScore: riskScores.get(key) ?? null,
      };
    });

    const primary =
      tokenRows.find((t) => t.chainId === primaryChainId && t.priceUsd !== null) ??
      tokenRows.find((t) => t.priceUsd !== null) ??
      null;
    const primaryRisk =
      tokenRows.find((t) => t.chainId === primaryChainId && t.riskScore !== null) ??
      tokenRows.find((t) => t.riskScore !== null) ??
      null;

    return {
      ticker: u.ticker,
      name: u.name,
      category: u.category,
      exchange: u.exchange,
      issuerCount: new Set(tokenRows.map((t) => t.issuerId)).size,
      chainCount: new Set(tokenRows.map((t) => t.chainId)).size,
      tokenCount: tokenRows.length,
      primaryPriceUsd: primary?.priceUsd ?? null,
      primaryPremiumBps: primary?.premiumBps ?? null,
      primaryRiskScore: primaryRisk?.riskScore ?? null,
      tokens: tokenRows,
    };
  });
}

export type AssetSort = "most_available" | "alphabetical";

export function sortAssetSummaries(assets: AssetSummary[], sort: AssetSort): AssetSummary[] {
  const copy = [...assets];
  if (sort === "most_available") {
    return copy.sort((a, b) => b.tokenCount - a.tokenCount || a.ticker.localeCompare(b.ticker));
  }
  return copy.sort((a, b) => a.ticker.localeCompare(b.ticker));
}
