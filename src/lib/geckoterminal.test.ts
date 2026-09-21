import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  fetchMarketPool,
  fetchMarketPools,
  fetchOhlcv,
  fetchTokenInfo,
} from "./geckoterminal";

/**
 * GeckoTerminal's actual API is unreachable from this sandbox (egress is
 * allowlisted and doesn't include it), so this pins a local server to the
 * documented JSON:API shape instead — same verification strategy already
 * used for GoPlus/Blockscout/Quick Intel elsewhere in this codebase. It
 * proves the parser reads the real field names correctly; it does not
 * prove GeckoTerminal's live response matches this shape exactly.
 */

const POOL_ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BASE_TOKEN_ADDRESS = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const QUOTE_TOKEN_ADDRESS = "0xcccccccccccccccccccccccccccccccccccccc";

function poolDoc(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: "pool",
    attributes: {
      address: POOL_ADDRESS,
      name: "FOO / WETH",
      pool_created_at: "2026-09-01T00:00:00Z",
      base_token_price_usd: "1.23",
      price_change_percentage: { m5: "0.5", h1: "1.2", h6: "-3.4", h24: "10.5" },
      volume_usd: { m5: "100", h1: "5000", h6: "20000", h24: "80000" },
      transactions: { h24: { buys: 42, sells: 17, buyers: 30, sellers: 12 } },
      fdv_usd: "1500000",
      market_cap_usd: "1200000",
      reserve_in_usd: "60000",
      ...overrides,
    },
    relationships: {
      base_token: { data: { id: `robinhood_${BASE_TOKEN_ADDRESS}`, type: "token" } },
      quote_token: { data: { id: `robinhood_${QUOTE_TOKEN_ADDRESS}`, type: "token" } },
      dex: { data: { id: "uniswap_v3_robinhood", type: "dex" } },
    },
  };
}

const INCLUDED = [
  {
    id: `robinhood_${BASE_TOKEN_ADDRESS}`,
    type: "token",
    attributes: {
      address: BASE_TOKEN_ADDRESS,
      name: "Foo Token",
      symbol: "FOO",
      image_url: "https://example.com/foo.png",
    },
  },
  {
    id: `robinhood_${QUOTE_TOKEN_ADDRESS}`,
    type: "token",
    attributes: {
      address: QUOTE_TOKEN_ADDRESS,
      name: "Wrapped ETH",
      symbol: "WETH",
      image_url: null,
    },
  },
  {
    id: "uniswap_v3_robinhood",
    type: "dex",
    attributes: { name: "Uniswap V3" },
  },
];

function routes(path: string): unknown {
  if (path === "/networks/robinhood/pools") {
    return { data: [poolDoc("robinhood_pool_1")], included: INCLUDED };
  }
  if (path === "/networks/robinhood/new_pools") {
    return {
      data: [poolDoc("robinhood_pool_2", { pool_created_at: new Date().toISOString() })],
      included: INCLUDED,
    };
  }
  if (path === `/networks/robinhood/pools/${POOL_ADDRESS}`) {
    return { data: poolDoc("robinhood_pool_1"), included: INCLUDED };
  }
  if (path === `/networks/robinhood/pools/${POOL_ADDRESS}/ohlcv/hour`) {
    return {
      data: {
        id: "x",
        type: "ohlcv_request_response",
        attributes: {
          // Newest-first, as GeckoTerminal actually returns it.
          ohlcv_list: [
            [1700003600, 1.3, 1.35, 1.28, 1.32, 500],
            [1700000000, 1.2, 1.3, 1.15, 1.25, 900],
          ],
        },
      },
    };
  }
  if (path === `/networks/robinhood/tokens/${BASE_TOKEN_ADDRESS}/info`) {
    return {
      data: {
        attributes: {
          description: "A test token.",
          websites: ["https://foo.example"],
          twitter_handle: "foo_token",
          telegram_handle: null,
          discord_url: null,
        },
      },
    };
  }
  return null;
}

let server: Server;

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    const payload = routes(path);
    res.setHeader("Content-Type", "application/json");
    if (payload === null) {
      res.statusCode = 404;
      res.end("{}");
      return;
    }
    res.end(JSON.stringify(payload));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.GECKOTERMINAL_API_URL = origin;
});

afterAll(() => {
  server?.close();
});

describe("fetchMarketPools", () => {
  it("decodes the 'all' (already-trading) list with real market data", async () => {
    const pools = await fetchMarketPools("all");
    expect(pools).toHaveLength(1);

    const pool = pools[0];
    expect(pool.poolAddress).toBe(POOL_ADDRESS);
    expect(pool.dexName).toBe("Uniswap V3");
    expect(pool.baseToken).toEqual({
      address: BASE_TOKEN_ADDRESS,
      symbol: "FOO",
      name: "Foo Token",
      imageUrl: "https://example.com/foo.png",
    });
    expect(pool.quoteToken.symbol).toBe("WETH");
    expect(pool.priceUsd).toBe(1.23);
    expect(pool.change).toEqual({ m5: 0.5, h1: 1.2, h6: -3.4, h24: 10.5 });
    expect(pool.volumeUsd24h).toBe(80000);
    expect(pool.fdvUsd).toBe(1500000);
    expect(pool.marketCapUsd).toBe(1200000);
    expect(pool.liquidityUsd).toBe(60000);
    expect(pool.txns24h).toEqual({ buys: 42, sells: 17 });
    // 2026-09-01 is in the past relative to any real test run.
    expect(pool.ageSeconds).toBeGreaterThan(0);
  });

  it("decodes the 'radar' (brand-new) list from a different endpoint", async () => {
    const pools = await fetchMarketPools("radar");
    expect(pools).toHaveLength(1);
    // Created "now" in the fixture — should read as very young.
    expect(pools[0].ageSeconds).toBeLessThan(60);
  });

  it("never throws on a malformed payload — returns empty instead", async () => {
    process.env.GECKOTERMINAL_API_URL = "http://127.0.0.1:1"; // nothing listening
    const pools = await fetchMarketPools("all");
    expect(pools).toEqual([]);
    process.env.GECKOTERMINAL_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
});

describe("fetchMarketPool", () => {
  it("fetches a single pool by its on-chain address", async () => {
    const pool = await fetchMarketPool(POOL_ADDRESS);
    expect(pool?.baseToken.symbol).toBe("FOO");
    expect(pool?.priceUsd).toBe(1.23);
  });

  it("returns null for an address the API doesn't have", async () => {
    const pool = await fetchMarketPool("0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead");
    expect(pool).toBeNull();
  });
});

describe("fetchOhlcv", () => {
  it("decodes candles and reorders them oldest-first for charting", async () => {
    const candles = await fetchOhlcv(POOL_ADDRESS, "hour", 1);
    expect(candles).toHaveLength(2);
    expect(candles[0].timestamp).toBe(1700000000);
    expect(candles[1].timestamp).toBe(1700003600);
    expect(candles[0]).toEqual({
      timestamp: 1700000000,
      open: 1.2,
      high: 1.3,
      low: 1.15,
      close: 1.25,
      volume: 900,
    });
  });
});

describe("fetchTokenInfo", () => {
  it("reads community-submitted socials when present", async () => {
    const info = await fetchTokenInfo(BASE_TOKEN_ADDRESS);
    expect(info).toEqual({
      description: "A test token.",
      website: "https://foo.example",
      twitter: "foo_token",
      telegram: null,
      discord: null,
    });
  });

  it("returns null rather than a half-filled object when absent", async () => {
    const info = await fetchTokenInfo(QUOTE_TOKEN_ADDRESS);
    expect(info).toBeNull();
  });
});
