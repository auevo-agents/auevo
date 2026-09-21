import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { getSupabaseServer } from "@/lib/supabase";
import { fetchMarketPool } from "@/lib/geckoterminal";

export const maxDuration = 20;

const ACTIVITY_LIMIT = 100;

/**
 * A wallet's real on-chain activity — read from our own indexer
 * (indexer_swaps), not a third-party API. Only covers whatever window
 * the indexer has actually reached (see lib/indexer/run.ts) — a wallet
 * quiet in that window shows no activity here even if it has a long
 * history further back; that's the same honest limitation Smart Money
 * already discloses, not a bug specific to this page.
 */
export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/wallets/[address]/activity">
) {
  const { address: raw } = await ctx.params;
  if (!isAddress(raw, { strict: false })) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const address = getAddress(raw);

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ swaps: [], pools: {}, indexed: false });
  }

  const { data: swaps, error } = await supabase
    .from("indexer_swaps")
    .select("pool_address, sender, recipient, amount0, amount1, tick, block_number, block_timestamp, tx_hash")
    .or(`sender.eq.${address},recipient.eq.${address}`)
    .order("block_number", { ascending: false })
    .limit(ACTIVITY_LIMIT);

  if (error) {
    return NextResponse.json({ error: `Could not read activity: ${error.message}` }, { status: 500 });
  }

  const poolAddresses = [...new Set((swaps ?? []).map((s) => s.pool_address as string))];

  const { data: poolRows } = poolAddresses.length
    ? await supabase.from("indexer_pools").select("pool_address, token0, token1").in("pool_address", poolAddresses)
    : { data: [] as { pool_address: string; token0: string; token1: string }[] };

  // Best-effort symbol/name lookup via the same GeckoTerminal client
  // Market already uses — indexer_pools only has raw addresses, and a
  // wallet's activity page is exactly the kind of occasional lookup that
  // fetchMarketPool's own cache (see geckoterminal.ts) is meant for.
  const pools: Record<
    string,
    { token0: string; token1: string; token0Symbol: string | null; token1Symbol: string | null }
  > = {};

  await Promise.all(
    (poolRows ?? []).map(async (p) => {
      const market = await fetchMarketPool(p.pool_address).catch(() => null);
      const symbolFor = (tokenAddress: string): string | null => {
        if (!market) return null;
        if (market.baseToken.address?.toLowerCase() === tokenAddress.toLowerCase()) {
          return market.baseToken.symbol;
        }
        if (market.quoteToken.address?.toLowerCase() === tokenAddress.toLowerCase()) {
          return market.quoteToken.symbol;
        }
        return null;
      };
      pools[p.pool_address] = {
        token0: p.token0,
        token1: p.token1,
        token0Symbol: symbolFor(p.token0),
        token1Symbol: symbolFor(p.token1),
      };
    })
  );

  // Computed here, not client-side: the client renders this straight
  // into JSX, and calling Date.now() during render makes a component
  // impure (unstable on every re-render).
  const now = Date.now();
  const swapsWithAge = (swaps ?? []).map((s) => ({
    ...s,
    age_seconds: s.block_timestamp ? (now - new Date(s.block_timestamp).getTime()) / 1000 : null,
  }));

  return NextResponse.json({ swaps: swapsWithAge, pools, indexed: true });
}
