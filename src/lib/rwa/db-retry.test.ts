import { describe, expect, it, vi } from "vitest";
import { withFetchRetry } from "./db-retry";

describe("withFetchRetry", () => {
  it("returns immediately on success, no retry", async () => {
    const fn = vi.fn(async () => ({ data: "ok", error: null }));
    const result = await withFetchRetry(fn, 1, 0);
    expect(result).toEqual({ data: "ok", error: null });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries once on a fetch-failure-shaped error and succeeds the second time", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls === 1) return { data: null, error: { message: "TypeError: fetch failed" } };
      return { data: "recovered", error: null };
    });
    const result = await withFetchRetry(fn, 1, 0);
    expect(result).toEqual({ data: "recovered", error: null });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry budget and returns the last error", async () => {
    const fn = vi.fn(async () => ({ data: null, error: { message: "TypeError: fetch failed" } }));
    const result = await withFetchRetry(fn, 1, 0);
    expect(result.error?.message).toContain("fetch failed");
    expect(fn).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it("never retries a real database error (not a network-failure signature)", async () => {
    const fn = vi.fn(async () => ({ data: null, error: { message: "duplicate key value violates unique constraint" } }));
    const result = await withFetchRetry(fn, 1, 0);
    expect(result.error?.message).toContain("duplicate key");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
