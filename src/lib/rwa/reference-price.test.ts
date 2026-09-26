import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computePremiumBps, fetchReferencePrice } from "./reference-price";

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
