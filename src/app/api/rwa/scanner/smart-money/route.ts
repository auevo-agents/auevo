import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { robinhoodChain } from "@/lib/chains";
import { aggregateIndexedWalletsUsd } from "@/lib/indexed-smart-money";
import { resolveQuoteAssets } from "@/lib/rwa/quote-assets";

export const maxDuration = 20;

const SWAP_ROWS_LIMIT = 5000;
const LEADERBOARD_LIMIT = 50;

/**
 * RWA_SPEC.md Phase 6's "лидерборд по акциям" — wallets accumulating
 * tokenized stocks specifically, not the generic (any-token) Smart Money
 * leaderboard the memecoin-era pages already have. Built from the same
 * indexer_swaps table (both v3 and v4 rows — see indexer/scan-v4.ts for
 * how a v4 row's `recipient` is populated), filtered to swaps where one
 * leg is a verified rwa_tokens address on Robinhood Chain (the only chain
 * this app's own indexer covers).
 *
 * `?ticker=NVDA` narrows to just that ticker's tokens up front (not a
 * post-filter of the full leaderboard) — this is what the asset detail
 * page's own Smart Money block uses (RWA_SPEC.md's "блок на странице
 * актива"), so a wallet's PnL there reflects only its trading of that one
 * stock, not its whole RWA portfolio.
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ indexed: false, rows: [] });

  const ticker = new URL(req.url).searchParams.get("ticker")?.toUpperCase();

  let tokensQuery = supabase.from("rwa_tokens").select("address, underlying_ticker").eq("verified", true).eq("chain_id", robinhoodChain.id);
  if (ticker) tokensQuery = tokensQuery.eq("underlying_ticker", ticker);
  const { data: tokens, error: tokensError } = await tokensQuery;
  if (tokensError) return NextResponse.json({ error: `Could not read rwa_tokens: ${tokensError.message}` }, { status: 500 });
  if (!tokens || tokens.length === 0) return NextResponse.json({ indexed: true, rows: [] });

  const tickerByAddress = new Map(tokens.map((t) => [t.address.toLowerCase(), t.underlying_ticker]));
  const addressList = tokens.map((t) => t.address);

  // indexer_swaps has no token0/token1 of its own — those live on
  // indexer_pools (v3: by pool_address, v4: by pool_id). Pull every swap
  // whose pool is one we can resolve, then join client-side; this table
  // has no view/foreign-key join exposed through PostgREST for a mixed
  // v3/v4 key, so a straight two-query join is the plain, correct option.
  const { data: pools, error: poolsError } = await supabase
    .from("indexer_pools")
    .select("pool_address, pool_id, token0, token1")
    .limit(5000); // same defensive cap as run.ts's own POOL_ADDRESS_FETCH_LIMIT
  if (poolsError) return NextResponse.json({ error: `Could not read indexer_pools: ${poolsError.message}` }, { status: 500 });

  const relevantPoolKeys = new Set<string>();
  const tokensByPoolKey = new Map<string, { token0: string; token1: string }>();
  for (const p of pools ?? []) {
    const isRwa = addressList.some((a) => a.toLowerCase() === p.token0.toLowerCase() || a.toLowerCase() === p.token1.toLowerCase());
    const key = p.pool_address ? `v3:${p.pool_address.toLowerCase()}` : `v4:${(p.pool_id as string).toLowerCase()}`;
    tokensByPoolKey.set(key, { token0: p.token0, token1: p.token1 });
    if (isRwa) relevantPoolKeys.add(key);
  }
  if (relevantPoolKeys.size === 0) return NextResponse.json({ indexed: true, rows: [] });

  const v3Addresses = [...relevantPoolKeys].filter((k) => k.startsWith("v3:")).map((k) => k.slice(3));
  const v4PoolIds = [...relevantPoolKeys].filter((k) => k.startsWith("v4:")).map((k) => k.slice(3));

  const [v3Swaps, v4Swaps] = await Promise.all([
    v3Addresses.length
      ? supabase.from("indexer_swaps").select("recipient, amount0, amount1, pool_address").in("pool_address", v3Addresses).limit(SWAP_ROWS_LIMIT)
      : Promise.resolve({ data: [], error: null }),
    v4PoolIds.length
      ? supabase.from("indexer_swaps").select("recipient, amount0, amount1, pool_id").in("pool_id", v4PoolIds).limit(SWAP_ROWS_LIMIT)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (v3Swaps.error) return NextResponse.json({ error: `Could not read indexer_swaps (v3): ${v3Swaps.error.message}` }, { status: 500 });
  if (v4Swaps.error) return NextResponse.json({ error: `Could not read indexer_swaps (v4): ${v4Swaps.error.message}` }, { status: 500 });

  const swapInputs = [
    ...(v3Swaps.data ?? []).map((s) => {
      const t = tokensByPoolKey.get(`v3:${s.pool_address.toLowerCase()}`)!;
      return { recipient: s.recipient, amount0: s.amount0.toString(), amount1: s.amount1.toString(), token0: t.token0, token1: t.token1 };
    }),
    ...(v4Swaps.data ?? []).map((s) => {
      const t = tokensByPoolKey.get(`v4:${(s.pool_id as string).toLowerCase()}`)!;
      return { recipient: s.recipient, amount0: s.amount0.toString(), amount1: s.amount1.toString(), token0: t.token0, token1: t.token1 };
    }),
  ];

  const quoteAssets = await resolveQuoteAssets();
  const leaderboard = aggregateIndexedWalletsUsd(swapInputs, quoteAssets).slice(0, LEADERBOARD_LIMIT);

  // Attach which ticker(s) each wallet's RWA trading actually touched —
  // the leaderboard math itself doesn't track this, so it's derived here
  // from the same swap rows rather than threading it through the
  // aggregator for one display-only field.
  const tickersByWallet = new Map<string, Set<string>>();
  for (const s of swapInputs) {
    const wallet = s.recipient.toLowerCase();
    const rwaLeg = [s.token0, s.token1].find((t) => tickerByAddress.has(t.toLowerCase()));
    if (!rwaLeg) continue;
    const set = tickersByWallet.get(wallet) ?? new Set<string>();
    set.add(tickerByAddress.get(rwaLeg.toLowerCase())!);
    tickersByWallet.set(wallet, set);
  }

  return NextResponse.json({
    indexed: true,
    rows: leaderboard.map((entry) => ({
      ...entry,
      tickers: [...(tickersByWallet.get(entry.wallet) ?? [])].sort(),
    })),
  });
}
