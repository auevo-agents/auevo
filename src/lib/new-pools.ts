import { decodeEventLog, getAddress, parseAbiItem, type Address } from "viem";
import { fetchBlockscoutLogs } from "./evm/blockscout";
import { getRobinhoodClient } from "./evm/client";
import { UNISWAP_V3_FACTORY } from "./uniswap";

/**
 * New-pairs feed for the Robinhood Chain Market page — every pool the
 * Uniswap V3 Factory has ever created, newest first, read straight off
 * the one factory address rather than crawling every token's own
 * history.
 *
 * PoolCreated's shape has not changed across any V3 deployment since
 * 2021 — it is one of the most stable event signatures in DeFi — so this
 * is safe to decode with confidence even without re-verifying it against
 * Robinhood Chain specifically, unlike the chain-specific facts (RPC
 * shape, contract addresses) this codebase has had to fetch and confirm
 * elsewhere.
 */
const POOL_CREATED_EVENT = parseAbiItem(
  "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)"
);

const ERC20_META_ABI = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

export interface NewPool {
  pool: Address;
  token0: Address;
  token1: Address;
  fee: number;
  blockNumber: string | null;
  ageSeconds: number | null;
  token0Symbol: string | null;
  token1Symbol: string | null;
}

async function readTokenSymbol(token: Address): Promise<string | null> {
  try {
    const client = getRobinhoodClient();
    const symbol = await client.readContract({
      address: token,
      abi: ERC20_META_ABI,
      functionName: "symbol",
    });
    return typeof symbol === "string" && symbol.trim() ? symbol.trim().slice(0, 20) : null;
  } catch {
    // Not every "token" in a pair resolves cleanly — a non-standard
    // symbol() encoding is a display gap, not a reason to drop the pool.
    return null;
  }
}

export async function fetchNewPools(limit = 60): Promise<NewPool[]> {
  const logs = await fetchBlockscoutLogs(UNISWAP_V3_FACTORY, limit);

  const decoded: NewPool[] = [];
  for (const log of logs) {
    try {
      const event = decodeEventLog({
        abi: [POOL_CREATED_EVENT],
        data: log.data as `0x${string}`,
        topics: log.topics.filter((t): t is `0x${string}` => t !== null) as [
          `0x${string}`,
          ...`0x${string}`[],
        ],
      });

      decoded.push({
        pool: getAddress(event.args.pool),
        token0: getAddress(event.args.token0),
        token1: getAddress(event.args.token1),
        fee: event.args.fee,
        blockNumber: log.blockNumber,
        ageSeconds: log.timestamp ? Math.max(0, Date.now() / 1000 - log.timestamp) : null,
        token0Symbol: null,
        token1Symbol: null,
      });
    } catch {
      // A log on the factory that isn't PoolCreated (unlikely, but the
      // factory is not guaranteed to only ever emit this one event type
      // forever) — skip it rather than fail the whole feed.
      continue;
    }
  }

  // Resolve symbols after decoding, not per-log, so one slow RPC call
  // doesn't serialize the whole feed — and only for what will actually
  // be shown.
  const top = decoded.slice(0, limit);
  await Promise.all(
    top.map(async (pool) => {
      const [symbol0, symbol1] = await Promise.all([
        readTokenSymbol(pool.token0),
        readTokenSymbol(pool.token1),
      ]);
      pool.token0Symbol = symbol0;
      pool.token1Symbol = symbol1;
    })
  );

  return top;
}

export function formatFeeTier(fee: number): string {
  return `${(fee / 10_000).toFixed(2)}%`;
}

export function formatAge(seconds: number | null): string {
  if (seconds === null) return "unknown";
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}
