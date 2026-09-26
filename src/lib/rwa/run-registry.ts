import type { Address } from "viem";
import { getRobinhoodClient, type RobinhoodClient } from "@/lib/evm/client";
import { Deadline } from "@/lib/evm/deadline";
import { getSupabaseServer } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { robinhoodChain } from "@/lib/chains";
import { discoverUsdgPools, resolveCandidateTokens } from "./registry";
import { fetchXstocksTokenList, tickerFromXstocksSymbol } from "./xstocks";
import { STATE_VIEW, USDG } from "./dex/addresses";
import { buildPoolKey } from "./dex/pool-key";
import { computeLiquidityUsd, computeVolume24hUsd } from "./pools";

/**
 * One incremental registry pass — RWA_SPEC.md Phase 1's
 * `/api/cron/rwa-registry`. Two independent sources, both gated to
 * tickers already in `rwa_underlyings` (see 0004_rwa_seed_underlyings.sql
 * for the current starter set): a token this app doesn't have an
 * underlying row for is never inserted, guessed at, or shown — the
 * foreign key on rwa_tokens.underlying_ticker enforces this at the
 * database level too, not just here.
 *
 * Same block-scan-with-lookback-jump shape as lib/indexer/run.ts, kept
 * separate rather than shared: this scan's event (v4 Initialize, not v3
 * PoolCreated/Swap), checkpoint table, and match/upsert logic are all
 * different enough that sharing would need a more generic abstraction
 * than either caller benefits from — the same call lib/indexer/scan.ts's
 * own doc comment makes about not sharing with lib/rwa/registry.ts.
 */

const MAX_CHUNKS_PER_SCAN = Number(process.env.RWA_REGISTRY_MAX_CHUNKS_PER_RUN) || 30;
const SCAN_BUDGET_MS = 20_000;
const START_BLOCK = BigInt(process.env.RWA_REGISTRY_START_BLOCK || "0");
const LOOKBACK_BLOCKS = BigInt(process.env.RWA_REGISTRY_LOOKBACK_BLOCKS || "2000000");

function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function nextFrom(synced: bigint, headBlock: bigint): bigint {
  const lookbackFloor = headBlock > LOOKBACK_BLOCKS ? headBlock - LOOKBACK_BLOCKS : 0n;
  const floor = maxBigInt(START_BLOCK, lookbackFloor);
  return maxBigInt(synced + 1n, floor);
}

export interface RegistryRunResult {
  status: "ok" | "skipped";
  reason?: string;
  headBlock?: string;
  robinhood?: { discovered: number; syncedTo: string; partial: boolean };
  xstocks?: { discovered: number; available: boolean };
  pools?: { refreshed: number; error?: string | null };
}

export async function runRegistryPass(): Promise<RegistryRunResult> {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return { status: "skipped", reason: "Supabase not configured" };
  }

  const { data: underlyingRows, error: underlyingsError } = await supabase
    .from("rwa_underlyings")
    .select("ticker");
  if (underlyingsError) {
    throw new Error(`Could not read rwa_underlyings: ${underlyingsError.message}`);
  }
  const knownTickers = new Set((underlyingRows ?? []).map((r) => r.ticker as string));

  const client = getRobinhoodClient();
  const headBlock = await client.getBlockNumber();

  const { data: state, error: stateError } = await supabase
    .from("rwa_registry_state")
    .select("synced_to_block")
    .eq("id", 1)
    .single();
  if (stateError || !state) {
    throw new Error(
      `Could not read rwa_registry_state — has 0005_rwa_registry_state.sql been applied? (${stateError?.message ?? "no row"})`
    );
  }

  const synced = BigInt(state.synced_to_block);
  const from = nextFrom(synced, headBlock);

  const scanResult =
    from <= headBlock
      ? await discoverUsdgPools(client, from, headBlock, MAX_CHUNKS_PER_SCAN, Deadline.in(SCAN_BUDGET_MS))
      : { pools: [], scannedTo: synced, partial: false };

  let robinhoodDiscovered = 0;
  // Pool discovery/metrics is genuinely separate work from token
  // discovery (a different table, a different failure mode — see below)
  // and must never be allowed to take down the rest of this pass: a
  // thrown error here previously aborted before reaching the
  // rwa_registry_state checkpoint update, which meant `synced_to_block`
  // could get stuck forever re-scanning the same range on every future
  // run even after tokens were already found and saved successfully.
  // Discovered the hard way: a real production run found and saved two
  // real tokens (NVDA, SPY) into rwa_tokens, then hit a transient
  // `TypeError: fetch failed` on the very next call (rwa_pools, a fresh
  // table with no prior traffic) and the whole pass died right there,
  // never reaching the checkpoint update below.
  let poolsError: string | null = null;
  if (scanResult.pools.length > 0) {
    const candidates = await resolveCandidateTokens(client, scanResult.pools);
    // Never guess a decimals value (`decimals` is not-null in the schema
    // for good reason — a wrong one silently corrupts every price/amount
    // shown for this token) and only ever record a ticker we already
    // recognize.
    const matched = candidates.filter(
      (c): c is typeof c & { symbol: string; decimals: number } =>
        c.symbol !== null && c.decimals !== null && knownTickers.has(c.symbol)
    );

    if (matched.length > 0) {
      const { error } = await supabase.from("rwa_tokens").upsert(
        matched.map((c) => ({
          chain_id: robinhoodChain.id,
          address: c.address,
          underlying_ticker: c.symbol,
          issuer_id: "robinhood",
          symbol: c.symbol,
          decimals: c.decimals,
          verified: true,
          first_seen_block: c.firstSeenBlock,
        })),
        { onConflict: "chain_id,address" }
      );
      if (error) throw new Error(`rwa_tokens upsert (robinhood) failed: ${error.message}`);
      robinhoodDiscovered = matched.length;

      // rwa_pools rows for every discovered pool whose token matched a
      // known ticker — not deduped by token the way `matched` is: a
      // token can legitimately have more than one v4 pool (different fee
      // tiers), and each is its own row. Only pools resolveCandidateTokens
      // dedup already discarded as duplicates of a *later* sighting of the
      // same pool_id are missing here, which is fine — pool_id is the
      // upsert key, so a later sighting just re-upserts the same row.
      try {
        const matchedAddresses = new Set(matched.map((c) => c.address.toLowerCase()));
        const matchedPools = scanResult.pools.filter((p) => matchedAddresses.has(p.token.toLowerCase()));
        if (matchedPools.length > 0) {
          const poolRows = matchedPools.map((p) => {
            const key = buildPoolKey(USDG, p.token, p.fee, p.tickSpacing, p.hooks);
            return {
              chain_id: robinhoodChain.id,
              pool_id: p.poolId,
              dex: "uniswap_v4" as const,
              token0: key.currency0,
              token1: key.currency1,
              fee: p.fee,
              tick_spacing: p.tickSpacing,
              hooks: p.hooks,
            };
          });
          const { error: upsertError } = await supabase.from("rwa_pools").upsert(poolRows, { onConflict: "chain_id,pool_id" });
          if (upsertError) throw new Error(`rwa_pools upsert failed: ${upsertError.message}`);
        }
      } catch (err) {
        poolsError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  let poolsRefreshed = 0;
  if (!poolsError) {
    try {
      poolsRefreshed = (await refreshPoolMetrics(client, supabase)).refreshed;
    } catch (err) {
      poolsError = err instanceof Error ? err.message : String(err);
    }
  }

  await supabase
    .from("rwa_registry_state")
    .update({ synced_to_block: scanResult.scannedTo.toString(), updated_at: new Date().toISOString() })
    .eq("id", 1);

  // xStocks: a fresh full fetch every run, not a checkpointed scan — it's
  // one HTTP request against a token list that changes rarely, not a
  // chain to crawl incrementally.
  const xstocksTokens = await fetchXstocksTokenList();
  let xstocksDiscovered = 0;

  if (xstocksTokens) {
    const matched = xstocksTokens
      .map((t) => ({ ...t, ticker: tickerFromXstocksSymbol(t.symbol) }))
      .filter((t): t is typeof t & { ticker: string } => t.ticker !== null && knownTickers.has(t.ticker));

    if (matched.length > 0) {
      const { error } = await supabase.from("rwa_tokens").upsert(
        matched.map((t) => ({
          chain_id: t.chainId,
          address: t.address,
          underlying_ticker: t.ticker,
          issuer_id: "xstocks",
          symbol: t.symbol,
          decimals: t.decimals,
          verified: true,
        })),
        { onConflict: "chain_id,address" }
      );
      if (error) throw new Error(`rwa_tokens upsert (xstocks) failed: ${error.message}`);
      xstocksDiscovered = matched.length;
    }
  }

  return {
    status: "ok",
    headBlock: headBlock.toString(),
    robinhood: {
      discovered: robinhoodDiscovered,
      syncedTo: scanResult.scannedTo.toString(),
      partial: scanResult.partial,
    },
    xstocks: { discovered: xstocksDiscovered, available: xstocksTokens !== null },
    pools: { refreshed: poolsRefreshed, error: poolsError },
  };
}

const STATE_VIEW_ABI = [
  {
    type: "function",
    name: "getSlot0",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
  },
  {
    type: "function",
    name: "getLiquidity",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [{ name: "liquidity", type: "uint128" }],
  },
] as const;

const VOLUME_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Refreshes liquidity_usd/volume_24h_usd for every rwa_pools row on this
 * chain — every run, not just newly discovered pools, since both numbers
 * are live state that changes independently of new pools ever being
 * found. Cheap: this app's own catalog only ever has a handful of RWA
 * pools (RWA_SPEC.md's own HyperDex research found ~199 total across two
 * chains, and this app only tracks Robinhood Chain's share of that), not
 * thousands, so one StateView read pair per pool per run is fine inside
 * this cron's existing budget.
 */
async function refreshPoolMetrics(client: RobinhoodClient, supabase: SupabaseClient): Promise<{ refreshed: number }> {
  const { data: pools, error: poolsError } = await supabase
    .from("rwa_pools")
    .select("pool_id, token0, token1, fee")
    .eq("chain_id", robinhoodChain.id)
    .eq("dex", "uniswap_v4");
  if (poolsError) throw new Error(`Could not read rwa_pools: ${poolsError.message}`);
  if (!pools || pools.length === 0) return { refreshed: 0 };

  const nonUsdgAddresses = pools.map((p) => (p.token0.toLowerCase() === USDG.toLowerCase() ? p.token1 : p.token0));
  const { data: priceRows, error: pricesError } = await supabase
    .from("rwa_prices")
    .select("token_address, price_usd, ts")
    .eq("chain_id", robinhoodChain.id)
    .in("token_address", nonUsdgAddresses)
    .order("ts", { ascending: false })
    .limit(2000);
  if (pricesError) throw new Error(`Could not read rwa_prices: ${pricesError.message}`);
  const priceByAddress = new Map<string, number | null>();
  for (const row of priceRows ?? []) {
    const key = row.token_address.toLowerCase();
    if (!priceByAddress.has(key)) priceByAddress.set(key, row.price_usd);
  }

  const since = new Date(Date.now() - VOLUME_WINDOW_MS).toISOString();
  const { data: swapRows, error: swapsError } = await supabase
    .from("indexer_swaps")
    .select("pool_id, amount0, amount1")
    .eq("dex", "uniswap_v4")
    .in(
      "pool_id",
      pools.map((p) => p.pool_id)
    )
    .gte("block_timestamp", since);
  if (swapsError) throw new Error(`Could not read indexer_swaps: ${swapsError.message}`);
  const swapsByPoolId = new Map<string, { amount0: number; amount1: number }[]>();
  for (const row of swapRows ?? []) {
    const list = swapsByPoolId.get(row.pool_id) ?? [];
    list.push({ amount0: Number(row.amount0), amount1: Number(row.amount1) });
    swapsByPoolId.set(row.pool_id, list);
  }

  let refreshed = 0;
  for (const pool of pools) {
    const usdgIsToken0 = pool.token0.toLowerCase() === USDG.toLowerCase();
    const nonUsdgAddress = (usdgIsToken0 ? pool.token1 : pool.token0) as Address;

    let sqrtPriceX96 = 0n;
    let liquidity = 0n;
    try {
      const [slot0, liquidityResult] = await Promise.all([
        client.readContract({ address: STATE_VIEW, abi: STATE_VIEW_ABI, functionName: "getSlot0", args: [pool.pool_id as `0x${string}`] }),
        client.readContract({ address: STATE_VIEW, abi: STATE_VIEW_ABI, functionName: "getLiquidity", args: [pool.pool_id as `0x${string}`] }),
      ]);
      sqrtPriceX96 = slot0[0];
      liquidity = liquidityResult;
    } catch {
      continue; // an RPC hiccup on one pool shouldn't drop every other pool's refresh this run
    }

    // decimals aren't stored on rwa_pools — USDG's are known statically;
    // the other side's decimals come from rwa_tokens (already required to
    // exist there, since a pool is only ever persisted for a matched,
    // already-verified token).
    const { data: tokenRow } = await supabase
      .from("rwa_tokens")
      .select("decimals")
      .eq("chain_id", robinhoodChain.id)
      .eq("address", nonUsdgAddress)
      .maybeSingle();
    const nonUsdgDecimals = tokenRow?.decimals ?? null;
    if (nonUsdgDecimals === null) continue;

    const nonUsdgPriceUsd = priceByAddress.get(nonUsdgAddress.toLowerCase()) ?? null;
    const liquidityUsd = computeLiquidityUsd({
      sqrtPriceX96,
      liquidity,
      currency0Decimals: usdgIsToken0 ? 6 : nonUsdgDecimals,
      currency1Decimals: usdgIsToken0 ? nonUsdgDecimals : 6,
      currency0PriceUsd: usdgIsToken0 ? 1 : nonUsdgPriceUsd,
      currency1PriceUsd: usdgIsToken0 ? nonUsdgPriceUsd : 1,
    });

    const swaps = swapsByPoolId.get(pool.pool_id) ?? [];
    const usdgSideAmounts = swaps.map((s) => (usdgIsToken0 ? s.amount0 : s.amount1));
    const volume24hUsd = computeVolume24hUsd(usdgSideAmounts);

    const { error: updateError } = await supabase
      .from("rwa_pools")
      .update({ liquidity_usd: liquidityUsd, volume_24h_usd: volume24hUsd, updated_at: new Date().toISOString() })
      .eq("chain_id", robinhoodChain.id)
      .eq("pool_id", pool.pool_id);
    if (updateError) throw new Error(`rwa_pools update failed: ${updateError.message}`);
    refreshed++;
  }

  return { refreshed };
}
