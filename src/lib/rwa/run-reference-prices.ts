import { getSupabaseServer } from "@/lib/supabase";
import { fetchReferencePrices } from "./reference-price";
import { withFetchRetry } from "./db-retry";

/**
 * Refreshes rwa_reference_prices (see migration 0016) — deliberately its
 * own, much less frequent cron than rwa-prices (every 4h vs every 5min):
 * Twelve Data's free tier is 800 credits/day, 1 credit per symbol per
 * call, and this catalog is already at ~87 tickers. Every 5 minutes would
 * burn the whole day's quota in under 2 hours regardless of batching
 * (batching only cuts HTTP requests, not credits) — discovered the hard
 * way 2026-09-28. Six refreshes/day x 87 tickers = 522 credits/day, with
 * room for the catalog to keep growing.
 *
 * A ticker Twelve Data didn't return a price for this pass (rate limit,
 * unrecognized symbol, transient error) simply keeps its last cached
 * row — never overwritten with a guess, and rwa-prices.ts's own premium
 * calculation is only ever as stale as this cache's fetched_at, which
 * the UI can (and should) surface.
 */
export interface ReferencePricesRunResult {
  status: "ok" | "skipped";
  reason?: string;
  tickersConsidered?: number;
  updated?: number;
}

export async function runReferencePricesPass(): Promise<ReferencePricesRunResult> {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return { status: "skipped", reason: "Supabase not configured" };
  }

  const { data: underlyings, error: underlyingsError } = await withFetchRetry(() =>
    supabase.from("rwa_underlyings").select("ticker")
  );
  if (underlyingsError) {
    throw new Error(`Could not read rwa_underlyings: ${underlyingsError.message}`);
  }
  const tickers = (underlyings ?? []).map((u) => u.ticker);
  if (tickers.length === 0) {
    return { status: "ok", tickersConsidered: 0, updated: 0 };
  }

  const prices = await fetchReferencePrices(tickers);
  if (prices.size === 0) {
    return { status: "ok", tickersConsidered: tickers.length, updated: 0 };
  }

  const rows = [...prices.entries()].map(([ticker, p]) => ({
    ticker,
    price_usd: p.priceUsd,
    source: p.source,
    fetched_at: p.asOf.toISOString(),
  }));

  const { error: upsertError } = await withFetchRetry(() =>
    supabase.from("rwa_reference_prices").upsert(rows, { onConflict: "ticker" })
  );
  if (upsertError) throw new Error(`rwa_reference_prices upsert failed: ${upsertError.message}`);

  return { status: "ok", tickersConsidered: tickers.length, updated: rows.length };
}
