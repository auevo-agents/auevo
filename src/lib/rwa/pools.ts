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

export interface TokenPriceFromPoolInput {
  sqrtPriceX96: bigint;
  /** true when USDG is currency0 of this pool's key — see dex/pool-key.ts's sortCurrencies (address order, not which side is "the RWA token"). */
  usdgIsCurrency0: boolean;
  tokenDecimals: number;
}

/**
 * A tokenized stock's own live on-chain price in USD, derived directly
 * from its v4 pool's sqrtPriceX96 against USDG (a 1:1 USD stablecoin) —
 * no external price API involved at all. This is Robinhood Chain's own
 * primary price source for run-prices.ts: gecko-price.ts's GeckoTerminal
 * lookup depends on a third party having already indexed this pool,
 * which a brand-new L2's own pools may not be yet; this app already
 * verified the pool itself exists (rwa_pools, from registry.ts), so it
 * doesn't need to wait on anyone else to read its own price back.
 *
 * sqrtPriceX96 encodes price = (currency1 raw) / (currency0 raw) —
 * see computeLiquidityUsd's own derivation above for amount0Raw/
 * amount1Raw; this is that same ratio, just expressed as a price instead
 * of a pair of reserves, then rebased from raw units to human ones and
 * flipped so the result is always "USD per one token", regardless of
 * which side of the pool key USDG landed on.
 */
export function computeTokenPriceUsdFromPool(input: TokenPriceFromPoolInput): number | null {
  const { sqrtPriceX96, usdgIsCurrency0, tokenDecimals } = input;
  if (sqrtPriceX96 === 0n) return null; // pool not yet initialized

  const priceX192 = sqrtPriceX96 * sqrtPriceX96; // (sqrtPriceX96/Q96)^2, kept as an integer ratio over Q96^2 until the final division
  const Q192 = Q96 * Q96;

  if (usdgIsCurrency0) {
    // price_raw (currency1 per currency0) = priceX192 / Q192 = (RWA raw) per (USDG raw)
    // USD per 1 RWA token = 1 / (price_raw * 10^(usdgDecimals - tokenDecimals)) = Q192 * 10^(tokenDecimals - usdgDecimals) / priceX192
    return (Number(Q192) / Number(priceX192)) * 10 ** (tokenDecimals - USDG_DECIMALS);
  }
  // USDG is currency1: price_raw (currency1 per currency0) = priceX192 / Q192 = (USDG raw) per (RWA raw)
  // USD per 1 RWA token = price_raw * 10^(tokenDecimals - usdgDecimals)
  return (Number(priceX192) / Number(Q192)) * 10 ** (tokenDecimals - USDG_DECIMALS);
}
