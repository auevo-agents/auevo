import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTokenPricesUsd } from "./gecko-price";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("fetchTokenPricesUsd", () => {
  it("returns an empty map for a chain with no known GeckoTerminal slug", async () => {
    global.fetch = vi.fn() as typeof fetch;
    const result = await fetchTokenPricesUsd(999_999, ["0xabc"]);
    expect(result.size).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("parses a well-formed price response, keyed by lowercased address", async () => {
    global.fetch = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain("/simple/networks/robinhood/token_price/0xAbC");
      return new Response(
        JSON.stringify({ data: { attributes: { token_prices: { "0xabc": "191.23" } } } }),
        { status: 200 }
      );
    }) as typeof fetch;

    const result = await fetchTokenPricesUsd(4663, ["0xAbC"]);
    expect(result.get("0xabc")).toBe(191.23);
  });

  it("maps chainId 196 (X Layer) to the confirmed GeckoTerminal slug 'x-layer'", async () => {
    global.fetch = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain("/simple/networks/x-layer/token_price/0xabc");
      return new Response(JSON.stringify({ data: { attributes: { token_prices: {} } } }), { status: 200 });
    }) as typeof fetch;

    await fetchTokenPricesUsd(196, ["0xabc"]);
    expect(global.fetch).toHaveBeenCalled();
  });

  it("drops a non-finite or non-positive price rather than recording it", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { attributes: { token_prices: { "0xaaa": "not-a-number", "0xbbb": "0", "0xccc": "5" } } },
          }),
          { status: 200 }
        )
    ) as typeof fetch;

    const result = await fetchTokenPricesUsd(4663, ["0xaaa", "0xbbb", "0xccc"]);
    expect(result.size).toBe(1);
    expect(result.get("0xccc")).toBe(5);
  });

  it("returns an empty map on a non-ok HTTP response", async () => {
    global.fetch = vi.fn(async () => new Response("", { status: 500 })) as typeof fetch;
    expect((await fetchTokenPricesUsd(4663, ["0xabc"])).size).toBe(0);
  });

  it("returns an empty map when the fetch itself throws", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network error");
    }) as typeof fetch;
    expect((await fetchTokenPricesUsd(4663, ["0xabc"])).size).toBe(0);
  });

  it("batches addresses beyond the single-call limit into multiple requests", async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string | URL) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ data: { attributes: { token_prices: {} } } }), { status: 200 });
    }) as typeof fetch;

    const addresses = Array.from({ length: 45 }, (_, i) => `0x${i.toString().padStart(40, "0")}`);
    await fetchTokenPricesUsd(1, addresses);
    expect(calls.length).toBe(2); // 30 + 15
  });
});
