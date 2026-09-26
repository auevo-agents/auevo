import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { robinhoodChain } from "@/lib/chains";
import { buildAssetSummaries, latestPricesByKey, sortAssetSummaries, type AssetSort } from "@/lib/rwa/catalog";

export const maxDuration = 15;

const PRICE_ROWS_LIMIT = 2000; // enough recent snapshots to cover every verified token at least once per 5-minute cron cycle

/**
 * RWA_SPEC.md Phase 3's /app/assets catalog. Reads through the server
 * (service-role Supabase client), same as every other data route in this
 * app — the public-read RLS policies from 0003_rwa.sql remain available
 * for a future direct-from-client query path, but this keeps the current
 * app-wide convention of never shipping a Supabase key to the browser.
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ indexed: false, assets: [] });
  }

  const { searchParams } = new URL(req.url);
  const sort: AssetSort = searchParams.get("sort") === "most_available" ? "most_available" : "alphabetical";

  const [{ data: underlyings, error: underlyingsError }, { data: tokens, error: tokensError }, { data: priceRows, error: pricesError }] =
    await Promise.all([
      supabase.from("rwa_underlyings").select("ticker, name, category, exchange"),
      supabase.from("rwa_tokens").select("chain_id, address, underlying_ticker, issuer_id, symbol, decimals").eq("verified", true),
      supabase.from("rwa_prices").select("chain_id, token_address, price_usd, premium_bps, ts").order("ts", { ascending: false }).limit(PRICE_ROWS_LIMIT),
    ]);

  if (underlyingsError) return NextResponse.json({ error: `Could not read rwa_underlyings: ${underlyingsError.message}` }, { status: 500 });
  if (tokensError) return NextResponse.json({ error: `Could not read rwa_tokens: ${tokensError.message}` }, { status: 500 });
  if (pricesError) return NextResponse.json({ error: `Could not read rwa_prices: ${pricesError.message}` }, { status: 500 });

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
    robinhoodChain.id
  );

  return NextResponse.json({ indexed: true, assets: sortAssetSummaries(summaries, sort) });
}
