import { describe, expect, it } from "vitest";
import { computeLiquidityUsd, computeVolume24hUsd, computeFeeAprPct, computeTokenPriceUsdFromPool } from "./pools";

const SQRT_PRICE_1_0 = 79228162514264337593543950336n; // Q96 itself — price ratio 1.0
const Q96 = 2n ** 96n;

function sqrtPriceX96For(priceRaw: number): bigint {
  return BigInt(Math.floor(Math.sqrt(priceRaw) * Number(Q96)));
}

describe("computeLiquidityUsd", () => {
  it("returns 0 for an uninitialized/empty pool", () => {
    expect(
      computeLiquidityUsd({
        sqrtPriceX96: 0n,
        liquidity: 0n,
        currency0Decimals: 6,
        currency1Decimals: 18,
        currency0PriceUsd: 1,
        currency1PriceUsd: 100,
      })
    ).toBe(0);
  });

  it("returns null when either side's price is unknown", () => {
    expect(
      computeLiquidityUsd({
        sqrtPriceX96: 79228162514264337593543950336n, // price = 1.0 in Q96
        liquidity: 1_000_000_000_000n,
        currency0Decimals: 6,
        currency1Decimals: 18,
        currency0PriceUsd: 1,
        currency1PriceUsd: null,
      })
    ).toBeNull();
  });

  it("computes virtual reserves at price = 1.0 symmetrically", () => {
    // sqrtPriceX96 for price 1.0 (Q96 itself) with equal decimals makes
    // amount0 == amount1 in raw units, so at equal USD prices the two
    // sides contribute equally to total liquidity.
    const usd = computeLiquidityUsd({
      sqrtPriceX96: 79228162514264337593543950336n,
      liquidity: 10n ** 18n,
      currency0Decimals: 18,
      currency1Decimals: 18,
      currency0PriceUsd: 2,
      currency1PriceUsd: 2,
    });
    expect(usd).not.toBeNull();
    expect(usd!).toBeGreaterThan(0);
    // amount0 == amount1 == 1 token at price=1.0, liquidity=1e18 -> each side is 1 token
    expect(usd!).toBeCloseTo(4, 5); // 1 token * $2 + 1 token * $2
  });
});

describe("computeVolume24hUsd", () => {
  it("sums the absolute value of the USDG-side amounts, scaled by USDG's 6 decimals", () => {
    const volume = computeVolume24hUsd([1_000_000000, -500_000000, 250_000000]);
    expect(volume).toBeCloseTo(1750, 5);
  });

  it("returns 0 for no swaps", () => {
    expect(computeVolume24hUsd([])).toBe(0);
  });
});

describe("computeFeeAprPct", () => {
  it("matches HyperDex's own worked example order of magnitude", () => {
    // $8.9K daily volume on a 0.3% pool against ~$9.7M liquidity is a
    // tiny APR — this just checks the formula's shape, not that exact figure.
    const apr = computeFeeAprPct(8_900, 3000, 9_700_000);
    expect(apr).not.toBeNull();
    expect(apr!).toBeGreaterThan(0);
    expect(apr!).toBeLessThan(1); // sanity: shouldn't be absurdly large for this input
  });

  it("returns null when liquidity is unknown or zero", () => {
    expect(computeFeeAprPct(1000, 3000, null)).toBeNull();
    expect(computeFeeAprPct(1000, 3000, 0)).toBeNull();
  });
});

describe("computeTokenPriceUsdFromPool", () => {
  it("returns null for an uninitialized pool", () => {
    expect(computeTokenPriceUsdFromPool({ sqrtPriceX96: 0n, usdgIsCurrency0: true, tokenDecimals: 18 })).toBeNull();
  });

  it("prices a token at $1 when the raw ratio is 1.0 and both sides share USDG's own 6 decimals", () => {
    const price = computeTokenPriceUsdFromPool({ sqrtPriceX96: SQRT_PRICE_1_0, usdgIsCurrency0: true, tokenDecimals: 6 });
    expect(price).toBeCloseTo(1, 6);
  });

  it("gives the same USD price regardless of which side of the pool key USDG landed on", () => {
    // price_raw = currency1/currency0. For $500/token with equal (6, 6)
    // decimals: USDG-as-currency0 needs 1 raw USDG = 1/500 raw token
    // (price_raw = 1/500); USDG-as-currency1 needs 500 raw USDG per raw
    // token directly (price_raw = 500) — the two orderings' raw ratios
    // are reciprocals of each other, not equal.
    const usdgFirst = computeTokenPriceUsdFromPool({
      sqrtPriceX96: sqrtPriceX96For(1 / 500),
      usdgIsCurrency0: true,
      tokenDecimals: 6,
    });
    const usdgSecond = computeTokenPriceUsdFromPool({
      sqrtPriceX96: sqrtPriceX96For(500),
      usdgIsCurrency0: false,
      tokenDecimals: 6,
    });
    expect(usdgFirst).toBeCloseTo(500, 1);
    expect(usdgSecond).toBeCloseTo(500, 1);
  });

  it("rebases correctly for an 18-decimal token against USDG's 6 decimals", () => {
    // price_raw = 1 means 1 raw USDG unit (1e-6 USDG) equals 1 raw token unit (1e-18 token) —
    // so 1 whole token (1e18 raw) = 1e18 raw USDG units = 1e12 USDG = $1e12. An extreme number,
    // but it's the correct rebasing of an intentionally extreme raw ratio, not a realistic quote.
    const price = computeTokenPriceUsdFromPool({ sqrtPriceX96: SQRT_PRICE_1_0, usdgIsCurrency0: true, tokenDecimals: 18 });
    expect(price).toBeCloseTo(1e12, -6);
  });
});
