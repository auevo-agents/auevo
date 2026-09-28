import { describe, expect, it } from "vitest";
import { bucketCandles, type PricePoint } from "./price-chart";

function point(ts: string, priceUsd: number | null): PricePoint {
  return { ts, priceUsd, referencePriceUsd: null };
}

describe("bucketCandles", () => {
  it("returns nothing when every point is null", () => {
    expect(bucketCandles([point("2026-01-01T00:00:00Z", null)], "priceUsd")).toEqual([]);
    expect(bucketCandles([], "priceUsd")).toEqual([]);
  });

  it("produces a flat doji for a single real point", () => {
    const candles = bucketCandles([point("2026-01-01T00:00:00Z", 50)], "priceUsd");
    expect(candles).toHaveLength(1);
    expect(candles[0]).toMatchObject({ open: 50, high: 50, low: 50, close: 50 });
  });

  it("never invents a value outside the real snapshots in a bucket — high/low/open/close all come from real data", () => {
    // All five snapshots land in the same 5-minute bucket (the minimum
    // bucket size), so this exercises the aggregation directly rather
    // than relying on the adaptive bucket-size math.
    const points = [
      point("2026-01-01T00:00:00Z", 10),
      point("2026-01-01T00:00:30Z", 12),
      point("2026-01-01T00:01:00Z", 8),
      point("2026-01-01T00:01:30Z", 11),
      point("2026-01-01T00:02:00Z", 9),
    ];
    const candles = bucketCandles(points, "priceUsd");
    expect(candles).toHaveLength(1);
    expect(candles[0].open).toBe(10); // first real snapshot
    expect(candles[0].close).toBe(9); // last real snapshot
    expect(candles[0].high).toBe(12); // real max, not a guess
    expect(candles[0].low).toBe(8); // real min, not a guess
  });

  it("skips null snapshots but keeps real ones in order", () => {
    const points = [point("2026-01-01T00:00:00Z", 100), point("2026-01-01T00:00:10Z", null), point("2026-01-01T00:00:20Z", 105)];
    const candles = bucketCandles(points, "priceUsd");
    expect(candles).toHaveLength(1);
    expect(candles[0].open).toBe(100);
    expect(candles[0].close).toBe(105);
  });

  it("puts snapshots far apart in time into separate candles", () => {
    const points = [point("2026-01-01T00:00:00Z", 10), point("2026-01-10T00:00:00Z", 20)];
    const candles = bucketCandles(points, "priceUsd");
    expect(candles.length).toBeGreaterThan(1);
    expect(candles[0].close).toBe(10);
    expect(candles[candles.length - 1].close).toBe(20);
  });

  it("sorts input by timestamp before bucketing, regardless of input order", () => {
    const points = [point("2026-01-01T00:02:00Z", 9), point("2026-01-01T00:00:00Z", 10)];
    const candles = bucketCandles(points, "priceUsd");
    expect(candles[0].open).toBe(10);
    expect(candles[0].close).toBe(9);
  });
});
