import { parseAbiItem, type Address } from "viem";
import type { RobinhoodClient } from "@/lib/evm/client";
import { Deadline } from "@/lib/evm/deadline";
import { readTokenMetadata } from "@/lib/evm/erc20";
import { POOL_MANAGER, USDG } from "@/lib/rwa/dex/addresses";

/**
 * Discovers tokenized-stock tokens on Robinhood Chain by finding every v4
 * pool quoted in USDG — the same quote asset every RWA token here trades
 * against (RWA_SPEC.md section 2) — rather than trusting a hardcoded
 * token-address list. RWA_SPEC.md's own phase-1 checklist names two
 * example addresses (NVDA, TSM) "to verify on Blockscout"; this discovers
 * them (and anything else) from the chain itself at runtime instead,
 * which is a stronger guarantee than trusting copy-pasted addresses from
 * a spec document, and doesn't go stale as more stocks get listed.
 *
 * v4 has no factory to enumerate pools from (see src/lib/rwa/dex/quote.ts's
 * own note on this) — PoolManager's `Initialize` event is the only way to
 * find them, and currency0/currency1 are each indexed, so this can filter
 * `eth_getLogs` server-side by "one leg is USDG" instead of pulling every
 * pool ever initialized (a wildcard scan for this event, un-filtered by
 * currency, was never tried against this RPC — but the indexer's own
 * discovery of an unrelated wildcard-query rejection on this same node
 * is reason enough to filter rather than find out the hard way).
 *
 * Confirmed against Uniswap/v4-core's own source
 * (src/interfaces/IPoolManager.sol) 2026-09-26 — the same discipline as
 * lib/indexer/events.ts: a wrong event signature doesn't error, it just
 * silently returns zero logs forever.
 */
const INITIALIZE_EVENT = parseAbiItem(
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)"
);

const CHUNK_BLOCKS = 10_000n;

export interface DiscoveredUsdgPool {
  poolId: `0x${string}`;
  /** The non-USDG leg — the candidate stock/asset token. */
  token: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
  blockNumber: string;
}

export interface ScanResult {
  pools: DiscoveredUsdgPool[];
  scannedTo: bigint;
  partial: boolean;
}

/**
 * Chunked scan for v4 pools with USDG on one side, checkpointed by the
 * caller (see api/cron/rwa-registry/route.ts) — same CHUNK_BLOCKS/deadline
 * shape as lib/indexer/scan.ts, kept as its own copy rather than shared
 * because this scan's event, filter and dedup logic are all different
 * (currency-filtered Initialize vs an address-filtered Swap batch) and a
 * shared abstraction over both would need to be more generic than either
 * caller actually benefits from.
 */
export async function discoverUsdgPools(
  client: RobinhoodClient,
  fromBlock: bigint,
  toBlock: bigint,
  maxChunks: number,
  deadline: Deadline
): Promise<ScanResult> {
  const pools: DiscoveredUsdgPool[] = [];
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
      const [asToken1, asToken0] = await Promise.all([
        client.getLogs({
          address: POOL_MANAGER,
          event: INITIALIZE_EVENT,
          args: { currency0: USDG },
          fromBlock: cursor,
          toBlock: chunkTo,
        }),
        client.getLogs({
          address: POOL_MANAGER,
          event: INITIALIZE_EVENT,
          args: { currency1: USDG },
          fromBlock: cursor,
          toBlock: chunkTo,
        }),
      ]);

      const seen = new Set<string>();
      for (const log of [...asToken1, ...asToken0]) {
        const { id, currency0, currency1, fee, tickSpacing, hooks } = log.args;
        if (
          id === undefined ||
          !currency0 ||
          !currency1 ||
          fee === undefined ||
          tickSpacing === undefined ||
          !hooks ||
          log.blockNumber === null
        ) {
          continue;
        }
        if (seen.has(id)) continue; // a pool matching both filters (shouldn't happen — currency0 != currency1) would otherwise double-count
        seen.add(id);

        const token = currency0.toLowerCase() === USDG.toLowerCase() ? currency1 : currency0;
        pools.push({
          poolId: id,
          token,
          fee,
          tickSpacing,
          hooks,
          blockNumber: log.blockNumber.toString(),
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

  return { pools, scannedTo, partial };
}

export interface CandidateToken {
  address: Address;
  symbol: string | null;
  decimals: number | null;
  firstSeenBlock: string;
}

/**
 * Resolves each discovered pool's non-USDG leg to its ERC-20 metadata —
 * reusing lib/evm/erc20.ts's readTokenMetadata rather than a fresh ABI
 * call, since it already handles the non-standard-token and hostile-text
 * cases (fake/lookalike symbols) a scanner has to expect.
 */
export async function resolveCandidateTokens(
  client: RobinhoodClient,
  pools: DiscoveredUsdgPool[]
): Promise<CandidateToken[]> {
  const byToken = new Map<string, DiscoveredUsdgPool>();
  for (const pool of pools) {
    const key = pool.token.toLowerCase();
    // Keep the earliest sighting — first_seen_block should reflect when
    // this token first got a USDG pool, not the most recent one found.
    const existing = byToken.get(key);
    if (!existing || BigInt(pool.blockNumber) < BigInt(existing.blockNumber)) {
      byToken.set(key, pool);
    }
  }

  return Promise.all(
    [...byToken.entries()].map(async ([, pool]) => {
      const meta = await readTokenMetadata(client, pool.token);
      return {
        address: pool.token,
        symbol: meta.symbol?.issues.length ? null : (meta.symbol?.display ?? null), // never trust a symbol flagged as disguised/hostile text
        decimals: meta.decimals,
        firstSeenBlock: pool.blockNumber,
      };
    })
  );
}
