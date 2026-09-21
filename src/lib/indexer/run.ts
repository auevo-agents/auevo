import { getRobinhoodClient } from "../evm/client";
import { Deadline } from "../evm/deadline";
import { getSupabaseServer } from "../supabase";
import { discoverPools, scanSwaps } from "./scan";

const MAX_CHUNKS_PER_SCAN = Number(process.env.INDEXER_MAX_CHUNKS_PER_RUN) || 30;
const SCAN_BUDGET_MS = 22_000;

export interface IndexerRunResult {
  status: "ok" | "skipped";
  reason?: string;
  headBlock?: string;
  pools?: { discovered: number; syncedTo: string; partial: boolean };
  swaps?: { found: number; syncedTo: string; partial: boolean };
}

function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
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

  const startBlock = BigInt(process.env.INDEXER_START_BLOCK || "0");
  const client = getRobinhoodClient();
  const headBlock = await client.getBlockNumber();

  const { data: state, error: stateError } = await supabase
    .from("indexer_state")
    .select("pools_synced_to_block, swaps_synced_to_block")
    .eq("id", 1)
    .single();

  if (stateError || !state) {
    throw new Error(
      `Could not read indexer_state — has the migration been applied? (${stateError?.message ?? "no row"})`
    );
  }

  const poolsSynced = BigInt(state.pools_synced_to_block);
  const swapsSynced = BigInt(state.swaps_synced_to_block);
  const poolsFrom = maxBigInt(poolsSynced === 0n ? startBlock : poolsSynced + 1n, startBlock);
  const swapsFrom = maxBigInt(swapsSynced === 0n ? startBlock : swapsSynced + 1n, startBlock);

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

  const swapsResult =
    swapsFrom <= headBlock
      ? await scanSwaps(client, swapsFrom, headBlock, MAX_CHUNKS_PER_SCAN, Deadline.in(SCAN_BUDGET_MS))
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

  await supabase
    .from("indexer_state")
    .update({
      pools_synced_to_block: poolsResult.scannedTo.toString(),
      swaps_synced_to_block: swapsResult.scannedTo.toString(),
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
  };
}
