import { describe, expect, it } from "vitest";
import { basePriceInWeth, tickToPrice } from "./uniswap-price";

describe("tickToPrice", () => {
  it("is 1 at tick 0 when both tokens have equal decimals", () => {
    expect(tickToPrice(0, 18, 18)).toBeCloseTo(1, 10);
  });

  it("adjusts for a token0/token1 decimals difference at tick 0", () => {
    // 1 raw unit of an 18-decimal token0 == 1 raw unit of a 6-decimal
    // token1 at tick 0 (raw price 1:1) means 1 whole token0 == 1e12
    // whole token1.
    expect(tickToPrice(0, 18, 6)).toBeCloseTo(1e12, 0);
  });
});

describe("basePriceInWeth", () => {
  it("inverts tickToPrice when WETH is token0", () => {
    // token0 = WETH (18dec), token1 = BASE (6dec): at tick 0, 1 WETH
    // buys 1e12 BASE, so 1 BASE is worth 1e-12 WETH.
    expect(basePriceInWeth(0, true, 18, 6)).toBeCloseTo(1e-12, 20);
  });

  it("uses tickToPrice directly when WETH is token1", () => {
    // token0 = BASE (6dec), token1 = WETH (18dec): at tick 0, 1 BASE
    // (raw unit parity) is worth 1e-12 WETH the same way.
    expect(basePriceInWeth(0, false, 6, 18)).toBeCloseTo(1e-12, 20);
  });

  it("agrees with itself regardless of which side WETH is on for a symmetric pool", () => {
    const a = basePriceInWeth(1000, true, 18, 18);
    const b = basePriceInWeth(-1000, false, 18, 18);
    expect(a).toBeCloseTo(b, 6);
  });
});
