/**
 * Uniswap V3's tick -> price conversion, used to read a pool's current
 * price straight off the last indexed Swap event's `tick` instead of
 * calling out to a third party for it. `price = 1.0001^tick` is
 * Uniswap V3's own definition (token1 per token0, before adjusting for
 * each token's decimals) — see Uniswap/v3-core's TickMath.sol.
 */

/** Price of token1 per 1 whole token0, decimal-adjusted for both tokens. */
export function tickToPrice(tick: number, decimals0: number, decimals1: number): number {
  const raw = Math.pow(1.0001, tick);
  return raw * Math.pow(10, decimals0 - decimals1);
}

/**
 * Price of the non-WETH ("base") leg of a WETH-paired pool, denominated
 * in WETH — i.e. how much WETH one whole unit of the base token is
 * worth right now, per this pool's last observed tick.
 */
export function basePriceInWeth(
  tick: number,
  wethIsToken0: boolean,
  decimals0: number,
  decimals1: number
): number {
  const token1PerToken0 = tickToPrice(tick, decimals0, decimals1);
  // If WETH is token0, token1PerToken0 is already "base per WETH" — invert
  // it to get "WETH per base". If WETH is token1, it's already what we want.
  return wethIsToken0 ? 1 / token1PerToken0 : token1PerToken0;
}
