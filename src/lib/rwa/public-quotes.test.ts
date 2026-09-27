import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicQuotes } from "./public-quotes";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("fetchPublicQuotes", () => {
  it("normalizes a well-formed CoinGecko simple/price response", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            bitcoin: { usd: 65000.12, usd_24h_change: 1.5 },
            ethereum: { usd: 3200.5, usd_24h_change: -2.1 },
            "pax-gold": { usd: 2650.0, usd_24h_change: 0.3 },
          })
        )
    ) as typeof fetch;

    const quotes = await fetchPublicQuotes();
    expect(quotes).toEqual([
      { symbol: "BTC", name: "Bitcoin", priceUsd: 65000.12, change24hPct: 1.5 },
      { symbol: "ETH", name: "Ethereum", priceUsd: 3200.5, change24hPct: -2.1 },
      { symbol: "PAXG", name: "PAX Gold", priceUsd: 2650.0, change24hPct: 0.3 },
    ]);
  });

  it("silently drops an id CoinGecko's response doesn't include, never inventing a price for it", async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ bitcoin: { usd: 65000, usd_24h_change: 1 } }))
    ) as typeof fetch;

    const quotes = await fetchPublicQuotes();
    expect(quotes).toHaveLength(1);
    expect(quotes[0].symbol).toBe("BTC");
  });

  it("returns an empty list rather than throwing when the API is unreachable", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network error");
    }) as typeof fetch;

    const quotes = await fetchPublicQuotes();
    expect(quotes).toEqual([]);
  });

  it("returns an empty list on a non-OK HTTP response", async () => {
    global.fetch = vi.fn(async () => new Response("rate limited", { status: 429 })) as typeof fetch;

    const quotes = await fetchPublicQuotes();
    expect(quotes).toEqual([]);
  });
});
