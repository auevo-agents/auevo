import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computePremiumBps, fetchReferencePrice, fetchReferencePrices } from "./reference-price";

const ORIGINAL_ENV = { ...process.env };
const originalFetch = global.fetch;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("fetchReferencePrice", () => {
  it("returns null when no provider is configured", async () => {
    delete process.env.REFERENCE_PRICE_PROVIDER;
    expect(await fetchReferencePrice("NVDA")).toBeNull();
  });

  it("returns null for the chainlink provider — documented as not yet implemented", async () => {
    process.env.REFERENCE_PRICE_PROVIDER = "chainlink";
    expect(await fetchReferencePrice("NVDA")).toBeNull();
  });

  it("returns null for twelvedata when no API key is set", async () => {
    process.env.REFERENCE_PRICE_PROVIDER = "twelvedata";
    delete process.env.REFERENCE_PRICE_API_KEY;
    expect(await fetchReferencePrice("NVDA")).toBeNull();
  });

  it("fetches and parses a twelvedata price, tagged delayed", async () => {
    process.env.REFERENCE_PRICE_PROVIDER = "twelvedata";
    process.env.REFERENCE_PRICE_API_KEY = "test-key";
    global.fetch = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain("symbol=NVDA");
      expect(String(url)).toContain("apikey=test-key");
      return new Response(JSON.stringify({ price: "191.23" }), { status: 200 });
    }) as typeof fetch;

    const result = await fetchReferencePrice("NVDA");
    expect(result).toEqual({ priceUsd: 191.23, asOf: expect.any(Date), source: "twelvedata", delayed: true });
  });

  it("returns null when twelvedata responds with its own error shape", async () => {
    process.env.REFERENCE_PRICE_PROVIDER = "twelvedata";
    process.env.REFERENCE_PRICE_API_KEY = "test-key";
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ code: 400, message: "symbol not found" }), { status: 200 })
    ) as typeof fetch;

    expect(await fetchReferencePrice("NOTATICKER")).toBeNull();
  });

  it("returns null when the HTTP request itself fails", async () => {
    process.env.REFERENCE_PRICE_PROVIDER = "twelvedata";
    process.env.REFERENCE_PRICE_API_KEY = "test-key";
    global.fetch = vi.fn(async () => new Response("", { status: 500 })) as typeof fetch;

    expect(await fetchReferencePrice("NVDA")).toBeNull();
  });

  it("returns null for an unrecognized provider value rather than guessing", async () => {
    process.env.REFERENCE_PRICE_PROVIDER = "some-typo";
    expect(await fetchReferencePrice("NVDA")).toBeNull();
  });
});

describe("fetchReferencePrices", () => {
  it("returns an empty map when no provider is configured", async () => {
    delete process.env.REFERENCE_PRICE_PROVIDER;
    const result = await fetchReferencePrices(["NVDA", "AAPL"]);
    expect(result.size).toBe(0);
  });

  it("returns an empty map for chainlink — not yet implemented for batches either", async () => {
    process.env.REFERENCE_PRICE_PROVIDER = "chainlink";
    const result = await fetchReferencePrices(["NVDA"]);
    expect(result.size).toBe(0);
  });

  it("fetches every ticker in one call when twelvedata is configured", async () => {
    process.env.REFERENCE_PRICE_PROVIDER = "twelvedata";
    process.env.REFERENCE_PRICE_API_KEY = "test-key";
    const fetchMock = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain("symbol=NVDA%2CAAPL");
      return new Response(JSON.stringify({ NVDA: { price: "191.23" }, AAPL: { price: "227.50" } }), { status: 200 });
    });
    global.fetch = fetchMock as typeof fetch;

    const result = await fetchReferencePrices(["NVDA", "AAPL"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.get("NVDA")).toEqual({ priceUsd: 191.23, asOf: expect.any(Date), source: "twelvedata", delayed: true });
    expect(result.get("AAPL")).toEqual({ priceUsd: 227.5, asOf: expect.any(Date), source: "twelvedata", delayed: true });
  });

  it("drops a ticker twelvedata reports an error for, keeping the rest", async () => {
    process.env.REFERENCE_PRICE_PROVIDER = "twelvedata";
    process.env.REFERENCE_PRICE_API_KEY = "test-key";
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ NVDA: { price: "191.23" }, NOTATICKER: { code: 400, message: "not found" } }), {
          status: 200,
        })
    ) as typeof fetch;

    const result = await fetchReferencePrices(["NVDA", "NOTATICKER"]);
    expect(result.get("NVDA")?.priceUsd).toBe(191.23);
    expect(result.has("NOTATICKER")).toBe(false);
  });

  it("handles a single-ticker batch, which twelvedata returns in the flat {price} shape", async () => {
    process.env.REFERENCE_PRICE_PROVIDER = "twelvedata";
    process.env.REFERENCE_PRICE_API_KEY = "test-key";
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ price: "191.23" }), { status: 200 })) as typeof fetch;

    const result = await fetchReferencePrices(["NVDA"]);
    expect(result.get("NVDA")?.priceUsd).toBe(191.23);
  });

  it("splits more than 100 tickers into multiple batch calls", async () => {
    process.env.REFERENCE_PRICE_PROVIDER = "twelvedata";
    process.env.REFERENCE_PRICE_API_KEY = "test-key";
    const tickers = Array.from({ length: 150 }, (_, i) => `T${i}`);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await fetchReferencePrices(tickers);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns an empty map when tickers is empty, without calling fetch", async () => {
    process.env.REFERENCE_PRICE_PROVIDER = "twelvedata";
    process.env.REFERENCE_PRICE_API_KEY = "test-key";
    const fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;

    const result = await fetchReferencePrices([]);
    expect(result.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("computePremiumBps", () => {
  it("computes a positive premium when price is above reference", () => {
    expect(computePremiumBps(105, 100)).toBe(500); // +5%
  });

  it("computes a negative premium (discount) when price is below reference", () => {
    expect(computePremiumBps(95, 100)).toBe(-500); // -5%
  });

  it("returns null when either price is null", () => {
    expect(computePremiumBps(null, 100)).toBeNull();
    expect(computePremiumBps(100, null)).toBeNull();
  });

  it("returns null rather than dividing by zero when reference is zero", () => {
    expect(computePremiumBps(100, 0)).toBeNull();
  });
});
