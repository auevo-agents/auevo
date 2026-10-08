import { describe, expect, it } from "vitest";
import { parseUnits } from "viem";
import { computePriceImpactPct } from "./liquidity";

describe("computePriceImpactPct", () => {
  it("returns null when there is no reference price", () => {
    expect(computePriceImpactPct(1000, parseUnits("5", 18), 18, null)).toBeNull();
    expect(computePriceImpactPct(1000, parseUnits("5", 18), 18, 0)).toBeNull();
  });

  it("is 0 when the quote exactly matches the reference-price-implied amount", () => {
    // $1000 in at a $200 reference price should buy exactly 5 tokens with zero impact.
    expect(computePriceImpactPct(1000, parseUnits("5", 18), 18, 200)).toBeCloseTo(0, 6);
  });

  it("is positive when the quote returns fewer tokens than the reference price implies", () => {
    // Same $1000/$200 setup, but the pool only actually returns 4.9 tokens — 2% worse.
    const pct = computePriceImpactPct(1000, parseUnits("4.9", 18), 18, 200);
    expect(pct).toBeCloseTo(2, 6);
  });

  it("is negative when the quote returns MORE tokens than the reference price implies (a discount, not impact)", () => {
    const pct = computePriceImpactPct(1000, parseUnits("5.1", 18), 18, 200);
    expect(pct).toBeLessThan(0);
  });
});
