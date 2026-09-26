import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Exercises the actual GET handler against a scripted Supabase
 * (PostgREST) server and a scripted GeckoTerminal server — same
 * strategy as the indexer's own integration test. This is the first
 * page reading indexer_swaps back out (everything before it only wrote
 * to that table), so it's worth proving the query shapes and the
 * pool/token resolution actually work, not just that they typecheck.
 */

const WALLET = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
const POOL_ADDRESS = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TOKEN_A = "0xcccccccccccccccccccccccccccccccccccccc"; // pool's token0
const TOKEN_B = "0xdddddddddddddddddddddddddddddddddddddd"; // pool's token1
const V4_POOL_ID = "0xv4pool00000000000000000000000000000000000000000000000000000001";

let dbServer: Server;
let geckoServer: Server;

beforeAll(async () => {
  dbServer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const table = url.pathname.replace("/rest/v1/", "");
    res.setHeader("Content-Type", "application/json");

    if (table === "indexer_swaps") {
      // Only the v3 leg of the route's two queries (dex=eq.uniswap_v3 vs
      // dex=eq.uniswap_v4) has a fixture here — v4 gets an empty result,
      // same as a real Postgres row-filter would for a wallet with no v4
      // activity. Phase 6's own dedicated v4 coverage lives in
      // indexer/run-v4.integration.test.ts and this route's own reliance
      // on the normalization is exercised by the "no v4 rows" path here.
      const isV4Query = url.searchParams.get("dex") === "eq.uniswap_v4";
      res.end(
        JSON.stringify(
          isV4Query
            ? [
                {
                  pool_id: V4_POOL_ID,
                  sender: "0x2222222222222222222222222222222222222222", // the router, per v4's own Swap event
                  recipient: WALLET, // tx.from, per indexer/scan-v4.ts
                  amount0: "500000",
                  amount1: "-1000000000000000000",
                  tick: 50,
                  block_number: 600,
                  block_timestamp: new Date(Date.now() - 30_000).toISOString(),
                  tx_hash: "0xv4swap",
                },
              ]
            : [
                {
                  pool_address: POOL_ADDRESS,
                  sender: "0x1111111111111111111111111111111111111111",
                  recipient: WALLET,
                  // Trader paid TOKEN_A (pool received it, positive) and
                  // received TOKEN_B (pool paid it out, negative).
                  amount0: "1000000000000000000",
                  amount1: "-2000000",
                  tick: -100,
                  block_number: 500,
                  block_timestamp: new Date(Date.now() - 60_000).toISOString(),
                  tx_hash: "0xdeadbeef",
                },
              ]
        )
      );
      return;
    }
    if (table === "indexer_pools") {
      const isV4Query = url.searchParams.get("pool_id") !== null;
      res.end(
        JSON.stringify(
          isV4Query ? [{ pool_id: V4_POOL_ID, token0: TOKEN_A, token1: TOKEN_B }] : [{ pool_address: POOL_ADDRESS, token0: TOKEN_A, token1: TOKEN_B }]
        )
      );
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => dbServer.listen(0, "127.0.0.1", resolve));
  const dbPort = (dbServer.address() as AddressInfo).port;

  geckoServer = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === `/networks/robinhood/pools/${POOL_ADDRESS}?include=base_token,quote_token,dex`) {
      res.end(
        JSON.stringify({
          data: {
            id: "robinhood_pool_1",
            type: "pool",
            attributes: {
              address: POOL_ADDRESS,
              name: "AAA / BBB",
              pool_created_at: "2026-09-01T00:00:00Z",
              base_token_price_usd: "1",
              price_change_percentage: {},
              volume_usd: {},
              transactions: {},
              fdv_usd: null,
              market_cap_usd: null,
              reserve_in_usd: "1000",
            },
            relationships: {
              base_token: { data: { id: `robinhood_${TOKEN_A}`, type: "token" } },
              quote_token: { data: { id: `robinhood_${TOKEN_B}`, type: "token" } },
              dex: { data: { id: "uniswap_v3_robinhood", type: "dex" } },
            },
          },
          included: [
            { id: `robinhood_${TOKEN_A}`, type: "token", attributes: { address: TOKEN_A, name: "Token A", symbol: "AAA", image_url: null } },
            { id: `robinhood_${TOKEN_B}`, type: "token", attributes: { address: TOKEN_B, name: "Token B", symbol: "BBB", image_url: null } },
            { id: "uniswap_v3_robinhood", type: "dex", attributes: { name: "Uniswap V3" } },
          ],
        })
      );
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => geckoServer.listen(0, "127.0.0.1", resolve));
  const geckoPort = (geckoServer.address() as AddressInfo).port;

  process.env.SUPABASE_URL = `http://127.0.0.1:${dbPort}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.GECKOTERMINAL_API_URL = `http://127.0.0.1:${geckoPort}`;
}, 30_000);

afterAll(() => {
  dbServer?.close();
  geckoServer?.close();
});

describe("GET /api/wallets/[address]/activity", () => {
  it("returns the wallet's swaps with resolved pool token symbols and a computed age", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/wallets/x/activity"), {
      params: Promise.resolve({ address: WALLET }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.indexed).toBe(true);
    expect(body.swaps).toHaveLength(2); // this wallet's v3 swap plus its v4 swap (see the next test) — both come back from one call

    const swap = body.swaps.find((s: { pool_address: string }) => s.pool_address === POOL_ADDRESS);
    expect(swap).toBeDefined();
    expect(swap.pool_address).toBe(POOL_ADDRESS);
    expect(swap.recipient).toBe(WALLET);
    expect(swap.amount0).toBe("1000000000000000000");
    expect(swap.amount1).toBe("-2000000");
    expect(typeof swap.age_seconds).toBe("number");
    expect(swap.age_seconds).toBeGreaterThan(0);
    expect(swap.age_seconds).toBeLessThan(120);

    const pool = body.pools[POOL_ADDRESS];
    expect(pool).toBeDefined();
    expect(pool.token0).toBe(TOKEN_A);
    expect(pool.token1).toBe(TOKEN_B);
    expect(pool.token0Symbol).toBe("AAA");
    expect(pool.token1Symbol).toBe("BBB");
  });

  it("includes a v4 swap alongside v3, normalized to the same pool_address-keyed shape", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/wallets/x/activity"), {
      params: Promise.resolve({ address: WALLET }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.swaps).toHaveLength(2);
    const v4Swap = body.swaps.find((s: { pool_address: string }) => s.pool_address === V4_POOL_ID);
    expect(v4Swap).toBeDefined();
    expect(v4Swap.recipient).toBe(WALLET); // tx.from, per indexer/scan-v4.ts — the Swap event's own sender is the router
    expect(body.pools[V4_POOL_ID]).toMatchObject({ token0: TOKEN_A, token1: TOKEN_B });
  });

  it("rejects an invalid address before touching the database", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/wallets/x/activity"), {
      params: Promise.resolve({ address: "not-an-address" }),
    });
    expect(res.status).toBe(400);
  });
});
