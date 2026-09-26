import { parseAbiItem } from "viem";

/**
 * Uniswap v4 PoolManager event signatures — confirmed verbatim against
 * Uniswap/v4-core's `src/interfaces/IPoolManager.sol` on GitHub
 * (2026-09-26), same discipline as events.ts's v3 signatures and for the
 * same reason: a wrong signature computes a different topic hash and
 * silently returns zero logs forever, never an error.
 *
 * A separate file from events.ts (v3) rather than added there — v4's
 * Initialize doubles as "pool creation" (v3's PoolCreated has no v4
 * analogue: there is no factory), and v4's Swap has a different shape
 * (int128 not int256, a trailing `fee`, and critically NO `recipient`
 * field — see indexer/scan-v4.ts for how attribution is handled without
 * one).
 */

export const V4_INITIALIZE_EVENT = parseAbiItem(
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)"
);

export const V4_SWAP_EVENT = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"
);
