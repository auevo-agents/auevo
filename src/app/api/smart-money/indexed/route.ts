import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { aggregateIndexedWallets } from "@/lib/indexed-smart-money";
import { WETH9 } from "@/lib/uniswap";

export const maxDuration = 20;

const SWAP_WINDOW = 3000;
const TOP_N = 25;

/**
 * The wallet leaderboard from our own indexer — see
 * lib/indexed-smart-money.ts for the methodology. No GeckoTerminal call
 * here: every figure (realized PnL, win rate, net flow) comes straight
 * from indexer_swaps' own signed amounts, so there's nothing to resolve
 * against a rate-limited third party and no risk of it exhausting
 * Market's shared GeckoTerminal budget.
 */
export async function GET() {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ indexed: false, wallets: [], swapsConsidered: 0 });
  }

  const { data: swaps, error: swapsError } = await supabase
    .from("indexer_swaps")
    .select("pool_address, recipient, amount0, amount1")
    .order("block_number", { ascending: false })
    .limit(SWAP_WINDOW);

  if (swapsError) {
    return NextResponse.json({ error: `Could not read indexer_swaps: ${swapsError.message}` }, { status: 500 });
  }

  const poolAddresses = [...new Set((swaps ?? []).map((s) => s.pool_address as string))];
  // indexer_pools.pool_address is stored EIP-55 checksummed (mixed
  // case); indexer_swaps.pool_address (poolAddresses, above) is always
  // lowercase. .in() is exact-match, so this silently matched nothing —
  // every swap's pool lookup below missed, every input got filtered
  // out, and this leaderboard was always empty. ilike (via .or()) is
  // case-insensitive; the Map key is lowercased to match.
  const { data: poolRows, error: poolsError } = poolAddresses.length
    ? await supabase
        .from("indexer_pools")
        .select("pool_address, token0, token1")
        .or(poolAddresses.map((a) => `pool_address.ilike.${a}`).join(","))
    : { data: [] as { pool_address: string; token0: string; token1: string }[], error: null };

  if (poolsError) {
    return NextResponse.json({ error: `Could not read indexer_pools: ${poolsError.message}` }, { status: 500 });
  }

  const poolsByAddress = new Map((poolRows ?? []).map((p) => [p.pool_address.toLowerCase(), p]));

  const inputs = (swaps ?? [])
    .map((s) => {
      const pool = poolsByAddress.get((s.pool_address as string).toLowerCase());
      return pool
        ? { recipient: s.recipient as string, amount0: s.amount0 as string, amount1: s.amount1 as string, token0: pool.token0, token1: pool.token1 }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const leaderboard = aggregateIndexedWallets(inputs, WETH9);

  return NextResponse.json({
    indexed: true,
    swapsConsidered: swaps?.length ?? 0,
    wallets: leaderboard.slice(0, TOP_N),
  });
}
