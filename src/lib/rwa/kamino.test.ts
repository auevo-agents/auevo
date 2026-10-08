import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchKaminoMarketReserves } from "./kamino";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("fetchKaminoMarketReserves", () => {
  it("parses a well-formed reserves/metrics response (real shape: numeric-string fields)", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              reserve: "resA",
              liquidityToken: "TSLAx",
              liquidityTokenMint: "mintA",
              supplyApy: "0.031",
              borrowApy: "0.052",
              totalSupplyUsd: "1000000",
              totalBorrowUsd: "400000",
            },
          ])
        )
    ) as typeof fetch;

    const reserves = await fetchKaminoMarketReserves("marketX");
    expect(reserves).toEqual([
      {
        reservePubkey: "resA",
        liquidityToken: "TSLAx",
        liquidityTokenMint: "mintA",
        supplyApyPct: 3.1,
        borrowApyPct: 5.2,
        totalSupplyUsd: 1_000_000,
        totalBorrowUsd: 400_000,
      },
    ]);
  });

  it("falls back to a truncated mint address when liquidityToken is missing", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            { reserve: "resA", liquidityTokenMint: "mintAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", supplyApy: "0.01", borrowApy: "0.02", totalSupplyUsd: "1", totalBorrowUsd: "1" },
          ])
        )
    ) as typeof fetch;

    const reserves = await fetchKaminoMarketReserves("marketX");
    expect(reserves?.[0].liquidityToken).toBe("mint…AAAA");
  });

  it("returns null on a non-ok HTTP response", async () => {
    global.fetch = vi.fn(async () => new Response("", { status: 500 })) as typeof fetch;
    expect(await fetchKaminoMarketReserves("marketX")).toBeNull();
  });

  it("returns null when the response isn't an array (unexpected shape)", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ oops: true }))) as typeof fetch;
    expect(await fetchKaminoMarketReserves("marketX")).toBeNull();
  });

  it("returns null when every reserve is missing both rate fields (a shape mismatch, not zero rates)", async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify([{ reserve: "resA", liquidityTokenMint: "mintA" }]))
    ) as typeof fetch;
    expect(await fetchKaminoMarketReserves("marketX")).toBeNull();
  });

  it("returns null on a network error", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;
    expect(await fetchKaminoMarketReserves("marketX")).toBeNull();
  });

  it("returns an empty array for a genuinely empty market rather than treating it as a shape mismatch", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify([]))) as typeof fetch;
    expect(await fetchKaminoMarketReserves("marketX")).toEqual([]);
  });
});
