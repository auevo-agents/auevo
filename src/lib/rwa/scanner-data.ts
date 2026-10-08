import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAssetSummaries, latestPricesByKey, type AssetSummary } from "./catalog";
import { robinhoodChain } from "@/lib/chains";
import { withFetchRetry } from "./db-retry";

const PRICE_ROWS_LIMIT = 2000;

/**
 * The same underlyings+tokens+prices assembly /api/rwa/assets (Phase 3)
 * does, factored out so the Premium and Arbitrage scanner routes (Phase 5)
 * don't each carry their own copy of the same three-table read.
 */
export async function loadTickerTokens(supabase: SupabaseClient): Promise<{ error: string | null; summaries: AssetSummary[] }> {
  const [
    { data: underlyings, error: underlyingsError },
    { data: tokens, error: tokensError },
    { data: priceRows, error: pricesError },
    { data: riskRows, error: riskError },
  ] = await Promise.all([
    withFetchRetry(() => supabase.from("rwa_underlyings").select("ticker, name, category, exchange")),
    withFetchRetry(() =>
      supabase.from("rwa_tokens").select("chain_id, address, underlying_ticker, issuer_id, symbol, decimals").eq("verified", true)
    ),
    withFetchRetry(() =>
      supabase.from("rwa_prices").select("chain_id, token_address, price_usd, premium_bps, ts").order("ts", { ascending: false }).limit(PRICE_ROWS_LIMIT)
    ),
    withFetchRetry(() => supabase.from("rwa_risk").select("chain_id, token_address, score")),
  ]);

  if (underlyingsError) return { error: `Could not read rwa_underlyings: ${underlyingsError.message}`, summaries: [] };
  if (tokensError) return { error: `Could not read rwa_tokens: ${tokensError.message}`, summaries: [] };
  if (pricesError) return { error: `Could not read rwa_prices: ${pricesError.message}`, summaries: [] };
  if (riskError) return { error: `Could not read rwa_risk: ${riskError.message}`, summaries: [] };

  const riskScores = new Map((riskRows ?? []).map((r) => [`${r.chain_id}:${r.token_address.toLowerCase()}`, r.score]));

  const summaries = buildAssetSummaries(
    (underlyings ?? []).map((u) => ({ ticker: u.ticker, name: u.name, category: u.category, exchange: u.exchange })),
    (tokens ?? []).map((t) => ({
      chainId: t.chain_id,
      address: t.address,
      underlyingTicker: t.underlying_ticker,
      issuerId: t.issuer_id,
      symbol: t.symbol,
      decimals: t.decimals,
    })),
    latestPricesByKey(priceRows ?? []),
    robinhoodChain.id,
    riskScores
  );

  return { error: null, summaries };
}
