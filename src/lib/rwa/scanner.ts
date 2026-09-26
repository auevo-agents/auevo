import type { AssetTokenRow } from "./catalog";

/**
 * RWA_SPEC.md Phase 5's Premium and Arbitrage scanner tabs — pure
 * assembly logic over the same per-ticker token rows Phase 3's catalog
 * already builds (rwa/catalog.ts's AssetSummary.tokens), so there is one
 * definition of "this token's latest price/premium", not two.
 */

export interface TickerTokens {
  ticker: string;
  name: string;
  tokens: AssetTokenRow[];
}

export interface PremiumRow extends AssetTokenRow {
  ticker: string;
  name: string;
}

/** Flattens every priced token across every ticker into one list — a token with no price yet has nothing to rank, so it's left out rather than sorted as "0% premium". */
export function buildPremiumRows(assets: TickerTokens[]): PremiumRow[] {
  return assets.flatMap((a) => a.tokens.filter((t) => t.premiumBps !== null).map((t) => ({ ...t, ticker: a.ticker, name: a.name })));
}

export function sortByAbsPremium(rows: PremiumRow[]): PremiumRow[] {
  return [...rows].sort((a, b) => Math.abs(b.premiumBps!) - Math.abs(a.premiumBps!));
}

export interface ArbitrageLeg {
  chainId: number;
  address: string;
  issuerId: string;
  symbol: string;
  priceUsd: number;
}

export interface ArbitrageRow {
  ticker: string;
  name: string;
  high: ArbitrageLeg;
  low: ArbitrageLeg;
  /** (high - low) / low, in basis points — the RAW spread. Does not net out a cross-chain bridge's fee or time-to-realize; RWA_SPEC.md's own Phase 4 (LI.FI quote) is where a live, netted cost for a *specific* pair is actually computed (see /app/swap), since quoting every ticker's bridge cost on every scanner page load would mean one LI.FI call per row on every request — too slow/expensive for a listing view. This is disclosed in the UI, not hidden. */
  spreadBps: number;
}

/**
 * One row per ticker that has at least two differently-priced verified
 * tokens (different issuer and/or chain) — the highest and lowest priced
 * legs, which is exactly the pair that spread is realized between. A
 * ticker with only one priced token, or where every priced token agrees
 * exactly, has no arbitrage to show and is left out.
 */
export function buildArbitrageRows(assets: TickerTokens[]): ArbitrageRow[] {
  const rows: ArbitrageRow[] = [];

  for (const a of assets) {
    const priced = a.tokens.filter((t): t is AssetTokenRow & { priceUsd: number } => typeof t.priceUsd === "number" && t.priceUsd > 0);
    if (priced.length < 2) continue;

    const high = priced.reduce((m, t) => (t.priceUsd > m.priceUsd ? t : m));
    const low = priced.reduce((m, t) => (t.priceUsd < m.priceUsd ? t : m));
    if (high.priceUsd === low.priceUsd) continue;

    rows.push({
      ticker: a.ticker,
      name: a.name,
      high: { chainId: high.chainId, address: high.address, issuerId: high.issuerId, symbol: high.symbol, priceUsd: high.priceUsd },
      low: { chainId: low.chainId, address: low.address, issuerId: low.issuerId, symbol: low.symbol, priceUsd: low.priceUsd },
      spreadBps: Math.round(((high.priceUsd - low.priceUsd) / low.priceUsd) * 10_000),
    });
  }

  return rows;
}

export function sortBySpreadDesc(rows: ArbitrageRow[]): ArbitrageRow[] {
  return [...rows].sort((a, b) => b.spreadBps - a.spreadBps);
}
