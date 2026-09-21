import type { Address } from "viem";
import type { RobinhoodClient } from "../evm/client";
import { Deadline } from "../evm/deadline";
import { UNISWAP_V3_FACTORY } from "../uniswap";
import { POOL_CREATED_EVENT, SWAP_EVENT } from "./events";

/**
 * Chunked eth_getLogs scanning for the chain indexer — same
 * CHUNK_BLOCKS/deadline-budget shape as lib/evm/holders.ts's Transfer-log
 * scan, reused here rather than reinvented, since it already reflects
 * what this chain's RPC can actually handle in one call.
 *
 * Swap events are scanned with NO address filter — every Uniswap V3 pool
 * emits the same Swap topic, so one getLogs call per chunk catches every
 * pool at once instead of one call per known pool. That does mean any
 * other contract sharing this exact event signature would show up too;
 * callers are expected to join against discovered pools (from
 * PoolCreated, which IS filtered to the real factory address) and drop
 * anything that doesn't match a known pool.
 */

export const CHUNK_BLOCKS = 10_000n;

export interface ScanResult<T> {
  items: T[];
  /** Highest block number actually scanned (inclusive) — the next run's checkpoint. */
  scannedTo: bigint;
  /** True when the deadline or chunk budget ran out before reaching `toBlock`. */
  partial: boolean;
}

export interface DiscoveredPool {
  poolAddress: Address;
  token0: Address;
  token1: Address;
  fee: number;
  blockNumber: string;
}

export interface RawSwap {
  poolAddress: Address;
  sender: Address;
  recipient: Address;
  amount0: string;
  amount1: string;
  sqrtPriceX96: string;
  tick: number;
  blockNumber: string;
  blockTimestamp: string | null;
  txHash: string;
  logIndex: number;
}

async function scanChunks<T>(
  client: RobinhoodClient,
  fromBlock: bigint,
  toBlock: bigint,
  maxChunks: number,
  deadline: Deadline,
  fetchChunk: (chunkFrom: bigint, chunkTo: bigint) => Promise<T[]>
): Promise<ScanResult<T>> {
  const items: T[] = [];
  let cursor = fromBlock;
  let chunksUsed = 0;
  let partial = false;
  let scannedTo = fromBlock > 0n ? fromBlock - 1n : 0n;

  while (cursor <= toBlock) {
    if (chunksUsed >= maxChunks || deadline.expired) {
      partial = true;
      break;
    }

    const chunkTo = cursor + CHUNK_BLOCKS - 1n > toBlock ? toBlock : cursor + CHUNK_BLOCKS - 1n;

    try {
      const chunkItems = await fetchChunk(cursor, chunkTo);
      items.push(...chunkItems);
      scannedTo = chunkTo;
    } catch {
      // Endpoint rejected this range (too wide, rate-limited) — stop here
      // rather than silently skipping a range; the next run retries it.
      partial = true;
      break;
    }

    chunksUsed += 1;
    cursor = chunkTo + 1n;
  }

  return { items, scannedTo, partial };
}

export async function discoverPools(
  client: RobinhoodClient,
  fromBlock: bigint,
  toBlock: bigint,
  maxChunks: number,
  deadline: Deadline
): Promise<ScanResult<DiscoveredPool>> {
  return scanChunks(client, fromBlock, toBlock, maxChunks, deadline, async (chunkFrom, chunkTo) => {
    const logs = await client.getLogs({
      address: UNISWAP_V3_FACTORY,
      event: POOL_CREATED_EVENT,
      fromBlock: chunkFrom,
      toBlock: chunkTo,
    });

    const pools: DiscoveredPool[] = [];
    for (const log of logs) {
      const { token0, token1, fee, pool } = log.args;
      if (!token0 || !token1 || fee === undefined || !pool || log.blockNumber === null) continue;
      pools.push({
        poolAddress: pool,
        token0,
        token1,
        fee,
        blockNumber: log.blockNumber.toString(),
      });
    }
    return pools;
  });
}

export async function scanSwaps(
  client: RobinhoodClient,
  fromBlock: bigint,
  toBlock: bigint,
  maxChunks: number,
  deadline: Deadline
): Promise<ScanResult<RawSwap>> {
  return scanChunks(client, fromBlock, toBlock, maxChunks, deadline, async (chunkFrom, chunkTo) => {
    const logs = await client.getLogs({
      event: SWAP_EVENT,
      fromBlock: chunkFrom,
      toBlock: chunkTo,
    });

    const blockNumbers = [...new Set(logs.map((l) => l.blockNumber).filter((b): b is bigint => b !== null))];
    const timestamps = new Map<bigint, string | null>();
    await Promise.all(
      blockNumbers.map(async (blockNumber) => {
        try {
          const block = await client.getBlock({ blockNumber });
          timestamps.set(blockNumber, new Date(Number(block.timestamp) * 1000).toISOString());
        } catch {
          timestamps.set(blockNumber, null);
        }
      })
    );

    const swaps: RawSwap[] = [];
    for (const log of logs) {
      const { sender, recipient, amount0, amount1, sqrtPriceX96, tick } = log.args;
      if (
        !sender ||
        !recipient ||
        amount0 === undefined ||
        amount1 === undefined ||
        sqrtPriceX96 === undefined ||
        tick === undefined ||
        log.blockNumber === null ||
        !log.transactionHash
      ) {
        continue;
      }
      swaps.push({
        poolAddress: log.address,
        sender,
        recipient,
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        sqrtPriceX96: sqrtPriceX96.toString(),
        tick,
        blockNumber: log.blockNumber.toString(),
        blockTimestamp: timestamps.get(log.blockNumber) ?? null,
        txHash: log.transactionHash,
        logIndex: log.logIndex ?? 0,
      });
    }
    return swaps;
  });
}
