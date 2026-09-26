import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchXstocksTokenList, tickerFromXstocksSymbol } from "./xstocks";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("tickerFromXstocksSymbol", () => {
  it("strips the trailing x suffix and uppercases", () => {
    expect(tickerFromXstocksSymbol("NVDAx")).toBe("NVDA");
  });

  it("handles a ticker with a dot (share class)", () => {
    expect(tickerFromXstocksSymbol("BRK.Bx")).toBe("BRK.B");
  });

  it("returns null for a symbol that doesn't end in x", () => {
    expect(tickerFromXstocksSymbol("USDG")).toBeNull();
  });

  it("returns null for the bare suffix with nothing before it", () => {
    expect(tickerFromXstocksSymbol("x")).toBeNull();
  });
});

describe("fetchXstocksTokenList", () => {
  it("parses a well-formed token list response", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            name: "xStocks",
            tokens: [
              { chainId: 1, address: "0xaaa", name: "NVIDIA xStock", symbol: "NVDAx", decimals: 18, logoURI: "x" },
              { chainId: 42161, address: "0xbbb", name: "Tesla xStock", symbol: "TSLAx", decimals: 18 },
            ],
          }),
          { status: 200 }
        )
    ) as typeof fetch;

    const tokens = await fetchXstocksTokenList();
    expect(tokens).toHaveLength(2);
    expect(tokens?.[0]).toEqual({ chainId: 1, address: "0xaaa", name: "NVIDIA xStock", symbol: "NVDAx", decimals: 18 });
  });

  it("drops malformed entries instead of throwing", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            tokens: [
              { chainId: 1, address: "0xaaa", name: "NVIDIA xStock", symbol: "NVDAx", decimals: 18 },
              { chainId: "not-a-number", address: "0xbbb", name: "Bad Entry", symbol: "BADx", decimals: 18 },
              { chainId: 1, name: "Missing address", symbol: "MISx", decimals: 18 },
            ],
          }),
          { status: 200 }
        )
    ) as typeof fetch;

    const tokens = await fetchXstocksTokenList();
    expect(tokens).toHaveLength(1);
    expect(tokens?.[0].symbol).toBe("NVDAx");
  });

  it("returns null on a non-ok HTTP response", async () => {
    global.fetch = vi.fn(async () => new Response("", { status: 500 })) as typeof fetch;
    expect(await fetchXstocksTokenList()).toBeNull();
  });

  it("returns null when the response isn't the expected token-list shape", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ oops: true }), { status: 200 })) as typeof fetch;
    expect(await fetchXstocksTokenList()).toBeNull();
  });

  it("returns null when the fetch itself throws", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network error");
    }) as typeof fetch;
    expect(await fetchXstocksTokenList()).toBeNull();
  });
});
