import { NextRequest, NextResponse } from "next/server";
import type { Address } from "viem";
import { getSupabaseServer } from "@/lib/supabase";
import { getRobinhoodClient } from "@/lib/evm/client";
import { robinhoodChain } from "@/lib/chains";
import { quoteDepth, DEPTH_BUCKETS_USD } from "@/lib/rwa/liquidity";

export const maxDuration = 25;

// Each token costs several sequential RPC round-trips (quoteRoute probes
// every v3 fee tier and v4 candidate per bucket) — capped so a page load
// stays well inside maxDuration. ?ticker= below bypasses the cap for one
// specific token, which is what a real user click needs.
const DEFAULT_LIMIT = 15;

/**
 * RWA_SPEC.md Phase 5's Liquidity scanner tab — see rwa/liquidity.ts for
 * why this is Robinhood-Chain-only and why $1K/$10K/$100K. Live-quotes on
 * every request rather than a cron: a stale liquidity snapshot is actively
 * misleading (a pool getting drained between cron runs would show a
 * "$100K OK" that's no longer true), where a stale premium/price is merely
 * a few minutes old.
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ indexed: false, rows: [] });

  const { searchParams } = new URL(req.url);
  const tickerFilter = searchParams.get("ticker")?.toUpperCase();

  let query = supabase
    .from("rwa_tokens")
    .select("chain_id, address, underlying_ticker, issuer_id, symbol, decimals")
    .eq("verified", true)
    .eq("chain_id", robinhoodChain.id);
  if (tickerFilter) query = query.eq("underlying_ticker", tickerFilter);
  if (!tickerFilter) query = query.limit(DEFAULT_LIMIT);

  const { data: tokens, error: tokensError } = await query;
  if (tokensError) return NextResponse.json({ error: `Could not read rwa_tokens: ${tokensError.message}` }, { status: 500 });
  if (!tokens || tokens.length === 0) return NextResponse.json({ indexed: true, rows: [], buckets: DEPTH_BUCKETS_USD });

  const { data: priceRows, error: pricesError } = await supabase
    .from("rwa_prices")
    .select("chain_id, token_address, reference_price_usd, ts")
    .eq("chain_id", robinhoodChain.id)
    .in(
      "token_address",
      tokens.map((t) => t.address)
    )
    .order("ts", { ascending: false })
    .limit(2000);
  if (pricesError) return NextResponse.json({ error: `Could not read rwa_prices: ${pricesError.message}` }, { status: 500 });

  const referenceByAddress = new Map<string, number | null>();
  for (const r of priceRows ?? []) {
    const key = r.token_address.toLowerCase();
    if (!referenceByAddress.has(key)) referenceByAddress.set(key, r.reference_price_usd);
  }

  const client = getRobinhoodClient();
  const rows = await Promise.all(
    tokens.map(async (t) => {
      const referencePriceUsd = referenceByAddress.get(t.address.toLowerCase()) ?? null;
      const depths = await quoteDepth(client, t.address as Address, t.decimals, referencePriceUsd);
      return {
        ticker: t.underlying_ticker,
        chainId: t.chain_id,
        address: t.address,
        issuerId: t.issuer_id,
        symbol: t.symbol,
        depths: depths.map((d) => ({ usdIn: d.usdIn, amountOut: d.amountOut?.toString() ?? null, priceImpactPct: d.priceImpactPct })),
      };
    })
  );

  return NextResponse.json({ indexed: true, rows, buckets: DEPTH_BUCKETS_USD, truncated: !tickerFilter && tokens.length === DEFAULT_LIMIT });
}
