import type { Address } from "viem";
import { getRobinhoodClient } from "../evm/client";
import { Deadline } from "../evm/deadline";
import { getSupabaseServer } from "../supabase";
import { discoverPools, scanSwaps } from "./scan";
import { discoverV4Pools, scanV4Swaps } from "./scan-v4";

const MAX_CHUNKS_PER_SCAN = Number(process.env.INDEXER_MAX_CHUNKS_PER_RUN) || 30;
const SCAN_BUDGET_MS = 22_000;
const START_BLOCK = BigInt(process.env.INDEXER_START_BLOCK || "0");
// This chain does a block roughly every 100ms — 68M+ blocks at the head
// already, and climbing by ~860k/day. A once-a-day, 60s-per-run cron
// (this project's actual plan) can make real, verifiable progress every
// run, but it can never crawl the *full* history in reasonable time.
// Rather than let both checkpoints spend months grinding through ancient
// blocks before reaching anything current, a checkpoint that's fallen
// more than this many blocks behind head jumps straight to
// `head - LOOKBACK_BLOCKS` instead of continuing linearly — trading
// "complete since genesis" for "actually reflects recent activity",
// which is what a *current* Smart Money leaderboard needs anyway.
// Already-scanned history is never lost by this, only future runs are
// redirected; a real deployed run is what surfaced this trade-off, not
// a guess (see the two commits around 2026-09-21 for what a naive
// from-genesis crawl and an unfiltered getLogs call both ran into).
const LOOKBACK_BLOCKS = BigInt(process.env.INDEXER_LOOKBACK_BLOCKS || "2000000");
const POOL_ADDRESS_FETCH_LIMIT = 5000;

export interface IndexerRunResult {
  status: "ok" | "skipped";
  reason?: string;
  headBlock?: string;
  pools?: { discovered: number; syncedTo: string; partial: boolean };
  swaps?: { found: number; syncedTo: string; partial: boolean };
  /** RWA_SPEC.md Phase 6 — the same shape as pools/swaps above, for Uniswap v4 (see scan-v4.ts). */
  v4Pools?: { discovered: number; syncedTo: string; partial: boolean };
  v4Swaps?: { found: number; syncedTo: string; partial: boolean };
}

function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

/** Where a checkpoint resumes from: normal +1, or a jump-ahead to the recent window if it's fallen too far behind. */
function nextFrom(synced: bigint, headBlock: bigint): bigint {
  const lookbackFloor = headBlock > LOOKBACK_BLOCKS ? headBlock - LOOKBACK_BLOCKS : 0n;
  const floor = maxBigInt(START_BLOCK, lookbackFloor);
  return maxBigInt(synced + 1n, floor);
}

/**
 * One incremental pass: read the checkpoint, scan forward a bounded
 * number of block-chunks for new pools and swaps, write what was found,
 * advance the checkpoint. See api/cron/index-chain/route.ts (the only
 * caller) for why this is safe to run on any schedule, and
 * supabase/migrations/0001_indexer.sql for the schema this reads/writes.
 */
export async function runIndexerPass(): Promise<IndexerRunResult> {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return { status: "skipped", reason: "Supabase not configured" };
  }

  const client = getRobinhoodClient();
  const headBlock = await client.getBlockNumber();

  const { data: state, error: stateError } = await supabase
    .from("indexer_state")
    .select("pools_synced_to_block, swaps_synced_to_block, v4_pools_synced_to_block, v4_swaps_synced_to_block")
    .eq("id", 1)
    .single();

  if (stateError || !state) {
    throw new Error(
      `Could not read indexer_state — has the migration been applied? (${stateError?.message ?? "no row"})`
    );
  }

  const poolsSynced = BigInt(state.pools_synced_to_block);
  const swapsSynced = BigInt(state.swaps_synced_to_block);
  const poolsFrom = nextFrom(poolsSynced, headBlock);

  const poolsResult =
    poolsFrom <= headBlock
      ? await discoverPools(client, poolsFrom, headBlock, MAX_CHUNKS_PER_SCAN, Deadline.in(SCAN_BUDGET_MS))
      : { items: [], scannedTo: poolsSynced, partial: false };

  if (poolsResult.items.length > 0) {
    const { error } = await supabase.from("indexer_pools").upsert(
      poolsResult.items.map((p) => ({
        pool_address: p.poolAddress,
        token0: p.token0,
        token1: p.token1,
        fee: p.fee,
        created_block: p.blockNumber,
      })),
      { onConflict: "pool_address", ignoreDuplicates: true }
    );
    if (error) throw new Error(`indexer_pools upsert failed: ${error.message}`);
  }

  // Swaps can only be attributed to pools we already know about (scan.ts
  // filters by address), so the swap scan is never allowed to run ahead
  // of pool discovery — capping its target block at how far pools have
  // synced, not head, guarantees every pool active in a scanned swap
  // range was already in this address list.
  const swapsFrom = nextFrom(swapsSynced, headBlock);
  const swapsCeiling = minBigInt(headBlock, poolsResult.scannedTo);

  const { data: poolRows, error: poolRowsError } = await supabase
    .from("indexer_pools")
    .select("pool_address")
    .limit(POOL_ADDRESS_FETCH_LIMIT);
  if (poolRowsError) throw new Error(`could not read indexer_pools: ${poolRowsError.message}`);
  const poolAddresses = (poolRows ?? []).map((r) => r.pool_address as Address);

  const swapsResult =
    swapsFrom <= swapsCeiling
      ? await scanSwaps(
          client,
          swapsFrom,
          swapsCeiling,
          poolAddresses,
          MAX_CHUNKS_PER_SCAN,
          Deadline.in(SCAN_BUDGET_MS)
        )
      : { items: [], scannedTo: swapsSynced, partial: false };

  if (swapsResult.items.length > 0) {
    const { error } = await supabase.from("indexer_swaps").upsert(
      swapsResult.items.map((s) => ({
        pool_address: s.poolAddress,
        sender: s.sender,
        recipient: s.recipient,
        amount0: s.amount0,
        amount1: s.amount1,
        sqrt_price_x96: s.sqrtPriceX96,
        tick: s.tick,
        block_number: s.blockNumber,
        block_timestamp: s.blockTimestamp,
        tx_hash: s.txHash,
        log_index: s.logIndex,
      })),
      { onConflict: "tx_hash,log_index", ignoreDuplicates: true }
    );
    if (error) throw new Error(`indexer_swaps upsert failed: ${error.message}`);
  }

  // v4 (RWA_SPEC.md Phase 6) — no per-pool contract to filter by, so
  // unlike v3 the swap scan needs no address list and isn't gated behind
  // pool discovery's progress; both run straight up to head.
  // Defensive fallback to 0, not just a type nicety: the scripted-Supabase
  // integration test's mock (and any real row from just before this
  // migration applied) may not carry these columns at all.
  const v4PoolsSynced = BigInt(state.v4_pools_synced_to_block ?? 0);
  const v4SwapsSynced = BigInt(state.v4_swaps_synced_to_block ?? 0);
  const v4PoolsFrom = nextFrom(v4PoolsSynced, headBlock);
  const v4SwapsFrom = nextFrom(v4SwapsSynced, headBlock);

  const v4PoolsResult =
    v4PoolsFrom <= headBlock
      ? await discoverV4Pools(client, v4PoolsFrom, headBlock, MAX_CHUNKS_PER_SCAN, Deadline.in(SCAN_BUDGET_MS))
      : { items: [], scannedTo: v4PoolsSynced, partial: false };

  if (v4PoolsResult.items.length > 0) {
    const { error } = await supabase.from("indexer_pools").upsert(
      v4PoolsResult.items.map((p) => ({
        dex: "uniswap_v4",
        pool_id: p.poolId,
        token0: p.currency0,
        token1: p.currency1,
        fee: p.fee,
        created_block: p.blockNumber,
      })),
      { onConflict: "pool_id", ignoreDuplicates: true }
    );
    if (error) throw new Error(`indexer_pools (v4) upsert failed: ${error.message}`);
  }

  const v4SwapsResult =
    v4SwapsFrom <= headBlock
      ? await scanV4Swaps(client, v4SwapsFrom, headBlock, MAX_CHUNKS_PER_SCAN, Deadline.in(SCAN_BUDGET_MS))
      : { items: [], scannedTo: v4SwapsSynced, partial: false };

  if (v4SwapsResult.items.length > 0) {
    const { error } = await supabase.from("indexer_swaps").upsert(
      v4SwapsResult.items.map((s) => ({
        dex: "uniswap_v4",
        pool_id: s.poolId,
        sender: s.sender,
        // v4's Swap event has no recipient field — this is the enclosing
        // tx's `from` instead (see scan-v4.ts's own doc comment).
        recipient: s.txFrom,
        amount0: s.amount0,
        amount1: s.amount1,
        sqrt_price_x96: s.sqrtPriceX96,
        tick: s.tick,
        block_number: s.blockNumber,
        block_timestamp: s.blockTimestamp,
        tx_hash: s.txHash,
        log_index: s.logIndex,
      })),
      { onConflict: "tx_hash,log_index", ignoreDuplicates: true }
    );
    if (error) throw new Error(`indexer_swaps (v4) upsert failed: ${error.message}`);
  }

  await supabase
    .from("indexer_state")
    .update({
      pools_synced_to_block: poolsResult.scannedTo.toString(),
      swaps_synced_to_block: swapsResult.scannedTo.toString(),
      v4_pools_synced_to_block: v4PoolsResult.scannedTo.toString(),
      v4_swaps_synced_to_block: v4SwapsResult.scannedTo.toString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  return {
    status: "ok",
    headBlock: headBlock.toString(),
    pools: {
      discovered: poolsResult.items.length,
      syncedTo: poolsResult.scannedTo.toString(),
      partial: poolsResult.partial,
    },
    swaps: {
      found: swapsResult.items.length,
      syncedTo: swapsResult.scannedTo.toString(),
      partial: swapsResult.partial,
    },
    v4Pools: {
      discovered: v4PoolsResult.items.length,
      syncedTo: v4PoolsResult.scannedTo.toString(),
      partial: v4PoolsResult.partial,
    },
    v4Swaps: {
      found: v4SwapsResult.items.length,
      syncedTo: v4SwapsResult.scannedTo.toString(),
      partial: v4SwapsResult.partial,
    },
  };
}
