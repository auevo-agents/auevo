import type { Address } from "viem";
import type { RobinhoodClient } from "../evm/client";
import { Deadline } from "../evm/deadline";
import { POOL_MANAGER } from "../rwa/dex/addresses";
import { V4_INITIALIZE_EVENT, V4_SWAP_EVENT } from "./events-v4";
import { CHUNK_BLOCKS, type ScanResult } from "./scan";

/**
 * v4 pool/swap scanning for the chain indexer — RWA_SPEC.md Phase 6.
 * Deliberately its own file, not folded into scan.ts's v3 functions: the
 * event shapes, filtering strategy and attribution logic are all
 * different enough that a shared abstraction would need to be more
 * generic than either version actually benefits from (same call made for
 * rwa/registry.ts's own separate v4 scan, which this is NOT reused from
 * either — that one is filtered to USDG-quoted pools only, for the RWA
 * catalog; this one is chain-wide, for Smart Money/wallet PnL across
 * every v4 pool a wallet has ever traded, matching the v3 indexer's own
 * chain-wide-not-curated scope).
 *
 * v4 has no factory and no per-pool contract — every pool lives behind
 * the single PoolManager contract (rwa/dex/addresses.ts), identified by a
 * bytes32 pool_id. That single-address-ness actually simplifies the swap
 * scan versus v3: v3 had to batch by a *list* of discovered pool contract
 * addresses (an unfiltered, chain-wide Swap-topic query was rejected by
 * this chain's RPC in production — see scan.ts's own note); v4's Swap
 * scan is already address-filtered to one contract by construction, so no
 * pool list or batching is needed to stay within whatever limit rejected
 * that v3 attempt.
 */

export interface DiscoveredV4Pool {
  poolId: `0x${string}`;
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
  blockNumber: string;
}

export interface RawV4Swap {
  poolId: `0x${string}`;
  sender: Address;
  /** The enclosing transaction's `from` — v4's Swap event has no recipient field at all (see this file's own doc comment and events-v4.ts). */
  txFrom: Address;
  amount0: string;
  amount1: string;
  sqrtPriceX96: string;
  tick: number;
  blockNumber: string;
  blockTimestamp: string | null;
  txHash: string;
  logIndex: number;
}

export async function discoverV4Pools(
  client: RobinhoodClient,
  fromBlock: bigint,
  toBlock: bigint,
  maxChunks: number,
  deadline: Deadline
): Promise<ScanResult<DiscoveredV4Pool>> {
  const items: DiscoveredV4Pool[] = [];
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
      const logs = await client.getLogs({
        address: POOL_MANAGER,
        event: V4_INITIALIZE_EVENT,
        fromBlock: cursor,
        toBlock: chunkTo,
      });
      for (const log of logs) {
        const { id, currency0, currency1, fee, tickSpacing, hooks } = log.args;
        if (id === undefined || !currency0 || !currency1 || fee === undefined || tickSpacing === undefined || !hooks || log.blockNumber === null) {
          continue;
        }
        items.push({ poolId: id, currency0, currency1, fee, tickSpacing, hooks, blockNumber: log.blockNumber.toString() });
      }
      scannedTo = chunkTo;
    } catch {
      partial = true;
      break;
    }

    chunksUsed += 1;
    cursor = chunkTo + 1n;
  }

  return { items, scannedTo, partial };
}

export async function scanV4Swaps(
  client: RobinhoodClient,
  fromBlock: bigint,
  toBlock: bigint,
  maxChunks: number,
  deadline: Deadline
): Promise<ScanResult<RawV4Swap>> {
  const items: RawV4Swap[] = [];
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
      const logs = await client.getLogs({
        address: POOL_MANAGER,
        event: V4_SWAP_EVENT,
        fromBlock: cursor,
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

      // Attribution needs the enclosing tx's `from` (see this file's doc
      // comment) — one lookup per unique tx hash in this chunk, not per
      // log, same batching shape as the timestamp lookups above.
      const txHashes = [...new Set(logs.map((l) => l.transactionHash).filter((h): h is `0x${string}` => h !== null))];
      const txFroms = new Map<string, Address | null>();
      await Promise.all(
        txHashes.map(async (hash) => {
          try {
            const tx = await client.getTransaction({ hash });
            txFroms.set(hash, tx.from);
          } catch {
            txFroms.set(hash, null);
          }
        })
      );

      for (const log of logs) {
        const { id, sender, amount0, amount1, sqrtPriceX96, tick } = log.args;
        if (
          id === undefined ||
          !sender ||
          amount0 === undefined ||
          amount1 === undefined ||
          sqrtPriceX96 === undefined ||
          tick === undefined ||
          log.blockNumber === null ||
          !log.transactionHash
        ) {
          continue;
        }
        const txFrom = txFroms.get(log.transactionHash);
        if (!txFrom) continue; // couldn't resolve the trader — skip rather than attribute to the wrong wallet

        items.push({
          poolId: id,
          sender,
          txFrom,
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
      scannedTo = chunkTo;
    } catch {
      partial = true;
      break;
    }

    chunksUsed += 1;
    cursor = chunkTo + 1n;
  }

  return { items, scannedTo, partial };
}
