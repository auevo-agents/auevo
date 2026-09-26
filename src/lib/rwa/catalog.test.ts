import { describe, expect, it } from "vitest";
import { buildAssetSummaries, latestPricesByKey, sortAssetSummaries } from "./catalog";

const ROBINHOOD = 4663;
const ETH = 1;

describe("latestPricesByKey", () => {
  it("keeps the first (most recent) row per chain+address and ignores older duplicates", () => {
    const map = latestPricesByKey([
      { chain_id: ROBINHOOD, token_address: "0xAAA", price_usd: 200, premium_bps: 100, ts: "2026-01-02T00:00:00Z" },
      { chain_id: ROBINHOOD, token_address: "0xaaa", price_usd: 190, premium_bps: 50, ts: "2026-01-01T00:00:00Z" },
    ]);
    expect(map.get(`${ROBINHOOD}:0xaaa`)).toEqual({ priceUsd: 200, premiumBps: 100, ts: "2026-01-02T00:00:00Z" });
  });
});

describe("buildAssetSummaries", () => {
  const underlyings = [
    { ticker: "NVDA", name: "NVIDIA Corporation", category: "stock", exchange: "NASDAQ" },
    { ticker: "TSLA", name: "Tesla, Inc.", category: "stock", exchange: "NASDAQ" },
  ];

  const tokens = [
    { chainId: ROBINHOOD, address: "0xrobinvda", underlyingTicker: "NVDA", issuerId: "robinhood", symbol: "NVDA", decimals: 18 },
    { chainId: ETH, address: "0xethnvda", underlyingTicker: "NVDA", issuerId: "xstocks", symbol: "NVDAx", decimals: 18 },
    // TSLA has a registry entry but no price snapshot yet.
    { chainId: ETH, address: "0xethtsla", underlyingTicker: "TSLA", issuerId: "xstocks", symbol: "TSLAx", decimals: 18 },
  ];

  it("prefers the primary chain's own price for the headline figure", () => {
    const prices = latestPricesByKey([
      { chain_id: ROBINHOOD, token_address: "0xrobinvda", price_usd: 185, premium_bps: 20, ts: "2026-01-01T00:00:00Z" },
      { chain_id: ETH, token_address: "0xethnvda", price_usd: 200, premium_bps: 900, ts: "2026-01-01T00:00:00Z" },
    ]);

    const summaries = buildAssetSummaries(underlyings, tokens, prices, ROBINHOOD);
    const nvda = summaries.find((s) => s.ticker === "NVDA")!;
    expect(nvda.primaryPriceUsd).toBe(185);
    expect(nvda.primaryPremiumBps).toBe(20);
    expect(nvda.issuerCount).toBe(2);
    expect(nvda.chainCount).toBe(2);
    expect(nvda.tokenCount).toBe(2);
  });

  it("falls back to any priced token when the primary chain has none", () => {
    const prices = latestPricesByKey([
      { chain_id: ETH, token_address: "0xethnvda", price_usd: 200, premium_bps: 900, ts: "2026-01-01T00:00:00Z" },
    ]);

    const summaries = buildAssetSummaries(underlyings, tokens, prices, ROBINHOOD);
    const nvda = summaries.find((s) => s.ticker === "NVDA")!;
    expect(nvda.primaryPriceUsd).toBe(200);
  });

  it("reports null (not zero or a guess) when no token for a ticker has a price yet", () => {
    const summaries = buildAssetSummaries(underlyings, tokens, new Map(), ROBINHOOD);
    const tsla = summaries.find((s) => s.ticker === "TSLA")!;
    expect(tsla.primaryPriceUsd).toBeNull();
    expect(tsla.tokenCount).toBe(1);
  });

  it("includes an underlying with zero discovered tokens rather than dropping it", () => {
    const summaries = buildAssetSummaries(
      [{ ticker: "AAPL", name: "Apple Inc.", category: "stock", exchange: "NASDAQ" }],
      [],
      new Map(),
      ROBINHOOD
    );
    expect(summaries[0].tokenCount).toBe(0);
    expect(summaries[0].tokens).toHaveLength(0);
  });
});

describe("sortAssetSummaries", () => {
  const summaries = buildAssetSummaries(
    [
      { ticker: "TSLA", name: "Tesla, Inc.", category: "stock", exchange: "NASDAQ" },
      { ticker: "NVDA", name: "NVIDIA Corporation", category: "stock", exchange: "NASDAQ" },
    ],
    [
      { chainId: ROBINHOOD, address: "0xa", underlyingTicker: "NVDA", issuerId: "robinhood", symbol: "NVDA", decimals: 18 },
      { chainId: ETH, address: "0xb", underlyingTicker: "NVDA", issuerId: "xstocks", symbol: "NVDAx", decimals: 18 },
    ],
    new Map(),
    ROBINHOOD
  );

  it("sorts alphabetically by ticker", () => {
    const sorted = sortAssetSummaries(summaries, "alphabetical");
    expect(sorted.map((s) => s.ticker)).toEqual(["NVDA", "TSLA"]);
  });

  it("sorts by token count (most available issuer/chain combinations first)", () => {
    const sorted = sortAssetSummaries(summaries, "most_available");
    expect(sorted[0].ticker).toBe("NVDA"); // 2 tokens vs TSLA's 0
  });
});
