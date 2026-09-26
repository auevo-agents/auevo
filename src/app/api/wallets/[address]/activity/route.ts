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

  const { data: v3Swaps, error: v3Error } = await supabase
    .from("indexer_swaps")
    .select("pool_address, sender, recipient, amount0, amount1, tick, block_number, block_timestamp, tx_hash")
    .eq("dex", "uniswap_v3")
    .or(`sender.eq.${address},recipient.eq.${address}`)
    .order("block_number", { ascending: false })
    .limit(ACTIVITY_LIMIT);
  if (v3Error) {
    return NextResponse.json({ error: `Could not read activity: ${v3Error.message}` }, { status: 500 });
  }

  // v4 (RWA_SPEC.md Phase 6): attribution is always via `recipient` (see
  // indexer/scan-v4.ts — for a v4 row this is the enclosing tx's `from`,
  // since the Swap event itself has no recipient field), so `sender.eq`
  // is skipped here — it would only ever match the router, never a wallet.
  const { data: v4Swaps, error: v4Error } = await supabase
    .from("indexer_swaps")
    .select("pool_id, sender, recipient, amount0, amount1, tick, block_number, block_timestamp, tx_hash")
    .eq("dex", "uniswap_v4")
    .eq("recipient", address)
    .order("block_number", { ascending: false })
    .limit(ACTIVITY_LIMIT);
  if (v4Error) {
    return NextResponse.json({ error: `Could not read v4 activity: ${v4Error.message}` }, { status: 500 });
  }

  // Normalized to the same `pool_address`-keyed shape the client already
  // uses for everything downstream (PnL, positions) — a v4 row's `pool_id`
  // stands in for `pool_address` here, since both are just opaque map keys
  // to that code, never actually dereferenced as an EVM address.
  const swaps = [...(v3Swaps ?? []), ...(v4Swaps ?? []).map((s) => ({ ...s, pool_address: s.pool_id as string }))]
    .sort((a, b) => b.block_number - a.block_number)
    .slice(0, ACTIVITY_LIMIT);

  const v3PoolAddresses = [...new Set((v3Swaps ?? []).map((s) => s.pool_address as string))];
  const v4PoolIds = [...new Set((v4Swaps ?? []).map((s) => s.pool_id as string))];

  const [{ data: v3PoolRows }, { data: v4PoolRows }] = await Promise.all([
    v3PoolAddresses.length
      ? supabase.from("indexer_pools").select("pool_address, token0, token1").in("pool_address", v3PoolAddresses)
      : Promise.resolve({ data: [] as { pool_address: string; token0: string; token1: string }[] }),
    v4PoolIds.length
      ? supabase.from("indexer_pools").select("pool_id, token0, token1").in("pool_id", v4PoolIds)
      : Promise.resolve({ data: [] as { pool_id: string; token0: string; token1: string }[] }),
  ]);
  const poolRows = [
    ...(v3PoolRows ?? []),
    // Same pool_id -> pool_address normalization as the swaps above.
    ...(v4PoolRows ?? []).map((p) => ({ pool_address: p.pool_id, token0: p.token0, token1: p.token1 })),
  ];

  // Best-effort symbol/name lookup via the same GeckoTerminal client
  // Market already uses — indexer_pools only has raw addresses, and a
  // wallet's activity page is exactly the kind of occasional lookup that
  // fetchMarketPool's own cache (see geckoterminal.ts) is meant for. For a
  // v4 row this passes a pool_id (not a real contract address) — GeckoTerminal
  // has nothing to match, fetchMarketPool fails, and this degrades to null
  // symbols for that pool exactly like an unlisted v3 pool already does.
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
