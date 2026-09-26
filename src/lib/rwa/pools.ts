/**
 * RWA_SPEC.md Phase 8's /app/pools — liquidity + 24h volume for the v4
 * RWA/USDG pools Phase 1's registry already discovers (rwa_pools,
 * populated by run-registry.ts). Pure computation lives here, split out
 * from the RPC/DB calls that gather its inputs, same convention as
 * rwa/liquidity.ts's own computePriceImpactPct.
 *
 * LIQUIDITY IS AN APPROXIMATION, NAMED AS SUCH — not full-range TVL.
 * Uniswap v4 has no factory/subgraph this app reads from, and computing
 * true full-range TVL needs summing liquidity across every initialized
 * tick range (tick-bitmap traversal), which this app doesn't do anywhere
 * else either (see dex/quote.ts's own note on v4 having no cheap
 * existence check the way v3's factory does). What StateView.getLiquidity
 * actually returns is the pool's currently ACTIVE liquidity (in range at
 * the current tick) — this converts that into the "virtual reserves"
 * each side would represent at the current price if that liquidity were
 * a plain constant-product pool, which is the same local approximation
 * a small, low-impact quote effectively relies on. It understates a
 * pool's true full-range TVL (concentrated liquidity outside the current
 * tick isn't counted) but needs no tick-bitmap traversal and is honest
 * about what it is, both here and in the UI that shows it.
 */

const Q96 = 1n << 96n;

export interface PoolLiquidityInput {
  sqrtPriceX96: bigint;
  liquidity: bigint;
  currency0Decimals: number;
  currency1Decimals: number;
  /** null when this app has no known USD price for this side — never guessed. */
  currency0PriceUsd: number | null;
  currency1PriceUsd: number | null;
}

/** null when either side's price is unknown — an approximate dollar liquidity is still a guess if either input is. */
export function computeLiquidityUsd(input: PoolLiquidityInput): number | null {
  const { sqrtPriceX96, liquidity, currency0Decimals, currency1Decimals, currency0PriceUsd, currency1PriceUsd } = input;
  if (liquidity === 0n || sqrtPriceX96 === 0n) return 0;
  if (currency0PriceUsd === null || currency1PriceUsd === null) return null;

  const amount0Raw = (liquidity * Q96) / sqrtPriceX96;
  const amount1Raw = (liquidity * sqrtPriceX96) / Q96;

  const amount0 = Number(amount0Raw) / 10 ** currency0Decimals;
  const amount1 = Number(amount1Raw) / 10 ** currency1Decimals;

  return amount0 * currency0PriceUsd + amount1 * currency1PriceUsd;
}

const USDG_DECIMALS = 6;

/**
 * Every RWA pool has USDG on one side (RWA_SPEC.md section 2), so 24h
 * volume in USD is just the sum of that side's swap amounts — no
 * external price needed, and no approximation beyond the on-chain
 * amounts themselves.
 */
export function computeVolume24hUsd(usdgSideAmounts: number[]): number {
  const totalRaw = usdgSideAmounts.reduce((sum, a) => sum + Math.abs(a), 0);
  return totalRaw / 10 ** USDG_DECIMALS;
}

/** HyperDex's own formula (RWA_SPEC.md section 2): daily fees × 365 / liquidity. fee is v4's own units (hundredths of a bip; 3000 = 0.3%). */
export function computeFeeAprPct(volume24hUsd: number, feeHundredthsOfBip: number, liquidityUsd: number | null): number | null {
  if (liquidityUsd === null || liquidityUsd <= 0) return null;
  const dailyFeesUsd = volume24hUsd * (feeHundredthsOfBip / 1_000_000);
  return ((dailyFeesUsd * 365) / liquidityUsd) * 100;
}
