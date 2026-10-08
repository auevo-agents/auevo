import { describe, expect, it } from "vitest";
import { buildArbitrageRows, buildPremiumRows, sortByAbsPremium, sortBySpreadDesc, type TickerTokens } from "./scanner";
import type { AssetTokenRow } from "./catalog";

function token(overrides: Partial<AssetTokenRow>): AssetTokenRow {
  return {
    chainId: 4663,
    address: "0x1111111111111111111111111111111111111111",
    issuerId: "ondo",
    symbol: "NVDAon",
    decimals: 18,
    priceUsd: null,
    premiumBps: null,
    priceAsOf: null,
    riskScore: null,
    ...overrides,
  };
}

describe("buildPremiumRows / sortByAbsPremium", () => {
  it("drops tokens with no premium and sorts by absolute value, not sign", () => {
    const assets: TickerTokens[] = [
      { ticker: "NVDA", name: "NVIDIA", tokens: [token({ premiumBps: 50 }), token({ premiumBps: null })] },
      { ticker: "TSLA", name: "Tesla", tokens: [token({ premiumBps: -300 })] },
    ];

    const rows = sortByAbsPremium(buildPremiumRows(assets));
    expect(rows).toHaveLength(2);
    expect(rows[0].ticker).toBe("TSLA"); // |-300| > |50|
    expect(rows[1].ticker).toBe("NVDA");
  });
});

describe("buildArbitrageRows / sortBySpreadDesc", () => {
  it("skips a ticker with fewer than two priced tokens", () => {
    const assets: TickerTokens[] = [{ ticker: "NVDA", name: "NVIDIA", tokens: [token({ priceUsd: 185 })] }];
    expect(buildArbitrageRows(assets)).toEqual([]);
  });

  it("skips a ticker where every priced token agrees exactly", () => {
    const assets: TickerTokens[] = [
      { ticker: "NVDA", name: "NVIDIA", tokens: [token({ priceUsd: 185, issuerId: "ondo" }), token({ priceUsd: 185, issuerId: "xstocks" })] },
    ];
    expect(buildArbitrageRows(assets)).toEqual([]);
  });

  it("pairs the highest and lowest priced tokens and computes spread in bps", () => {
    const assets: TickerTokens[] = [
      {
        ticker: "NVDA",
        name: "NVIDIA",
        tokens: [
          token({ priceUsd: 200, issuerId: "ondo", symbol: "NVDAon" }),
          token({ priceUsd: 190, issuerId: "xstocks", symbol: "NVDAx" }),
          token({ priceUsd: 185, issuerId: "robinhood", symbol: "NVDA" }),
        ],
      },
    ];

    const [row] = buildArbitrageRows(assets);
    expect(row.high).toMatchObject({ issuerId: "ondo", priceUsd: 200 });
    expect(row.low).toMatchObject({ issuerId: "robinhood", priceUsd: 185 });
    expect(row.spreadBps).toBe(Math.round(((200 - 185) / 185) * 10_000));
  });

  it("sorts rows by spread descending", () => {
    const assets: TickerTokens[] = [
      { ticker: "A", name: "A", tokens: [token({ priceUsd: 101 }), token({ priceUsd: 100 })] }, // ~99bps
      { ticker: "B", name: "B", tokens: [token({ priceUsd: 120 }), token({ priceUsd: 100 })] }, // 2000bps
    ];
    const rows = sortBySpreadDesc(buildArbitrageRows(assets));
    expect(rows[0].ticker).toBe("B");
    expect(rows[1].ticker).toBe("A");
  });
});
