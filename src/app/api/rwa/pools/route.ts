import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { robinhoodChain } from "@/lib/chains";
import { USDG } from "@/lib/rwa/dex/addresses";
import { computeFeeAprPct } from "@/lib/rwa/pools";

export const maxDuration = 15;

/**
 * RWA_SPEC.md Phase 8's /app/pools — reads the rwa_pools rows Phase 1's
 * registry cron discovers and refreshes (run-registry.ts's
 * refreshPoolMetrics). Fee APR is computed here at read time from the
 * stored liquidity_usd/volume_24h_usd/fee rather than stored as its own
 * column — it's a pure function of those three, so storing it too would
 * just be a second place it could go stale relative to the numbers it's
 * derived from.
 */
export async function GET() {
  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ indexed: false, pools: [] });

  const { data: pools, error } = await supabase
    .from("rwa_pools")
    .select("pool_id, pool_address, dex, token0, token1, fee, liquidity_usd, volume_24h_usd, updated_at")
    .eq("chain_id", robinhoodChain.id)
    .order("liquidity_usd", { ascending: false, nullsFirst: false });
  if (error) return NextResponse.json({ error: `Could not read rwa_pools: ${error.message}` }, { status: 500 });
  if (!pools || pools.length === 0) return NextResponse.json({ indexed: true, pools: [] });

  const tokenAddresses = new Set<string>();
  for (const p of pools) {
    if (p.token0.toLowerCase() !== USDG.toLowerCase()) tokenAddresses.add(p.token0);
    if (p.token1.toLowerCase() !== USDG.toLowerCase()) tokenAddresses.add(p.token1);
  }
  const { data: tokenRows, error: tokensError } = await supabase
    .from("rwa_tokens")
    .select("address, underlying_ticker, symbol")
    .eq("chain_id", robinhoodChain.id)
    .in("address", [...tokenAddresses]);
  if (tokensError) return NextResponse.json({ error: `Could not read rwa_tokens: ${tokensError.message}` }, { status: 500 });
  const tokenByAddress = new Map((tokenRows ?? []).map((t) => [t.address.toLowerCase(), t]));

  const rows = pools.map((p) => {
    const nonUsdgAddress = p.token0.toLowerCase() === USDG.toLowerCase() ? p.token1 : p.token0;
    const token = tokenByAddress.get(nonUsdgAddress.toLowerCase()) ?? null;
    const feeAprPct = computeFeeAprPct(p.volume_24h_usd ?? 0, p.fee, p.liquidity_usd);
    return {
      poolId: p.pool_id,
      poolAddress: p.pool_address,
      dex: p.dex,
      ticker: token?.underlying_ticker ?? null,
      symbol: token?.symbol ?? null,
      token0: p.token0,
      token1: p.token1,
      feeTier: p.fee,
      liquidityUsd: p.liquidity_usd,
      volume24hUsd: p.volume_24h_usd,
      feeAprPct,
      updatedAt: p.updated_at,
    };
  });

  return NextResponse.json({ indexed: true, pools: rows });
}
