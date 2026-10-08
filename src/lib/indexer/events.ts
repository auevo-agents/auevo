import { parseAbiItem } from "viem";

/**
 * Uniswap V3 core event signatures — confirmed verbatim against
 * Uniswap/v3-core on GitHub (contracts/interfaces/IUniswapV3Factory.sol
 * for PoolCreated, contracts/interfaces/pool/IUniswapV3PoolEvents.sol for
 * Swap) on 2026-09-21, not from memory or a search summary. Getting one
 * of these wrong is worse than a wrong contract address: a bad address
 * reverts immediately and loudly, but a bad event signature just
 * computes the wrong topic hash and silently returns zero logs forever
 * — nothing errors, the indexer just never finds anything.
 *
 * `fee` on PoolCreated is `uint24` and IS indexed (3rd indexed topic) —
 * noted because both are easy to get wrong from memory.
 */

export const POOL_CREATED_EVENT = parseAbiItem(
  "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)"
);

export const SWAP_EVENT = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"
);
