import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * RWA_SPEC.md Phase 6's "лидерборд по акциям" — a v3 pool trading a known
 * RWA token against USDG, a v4 pool trading a DIFFERENT RWA token against
 * WETH, and a third pool trading two non-RWA tokens (must be excluded).
 * The join logic under test (indexer_pools -> which pools are RWA-relevant
 * -> indexer_swaps for those pools' addresses/pool_ids) is the whole point
 * of this test — aggregateIndexedWalletsUsd's own math is already covered
 * by indexed-smart-money.test.ts.
 */

const RWA_TOKEN = "0xrwatoken000000000000000000000000000001";
const OTHER_RWA_TOKEN = "0xrwatoken000000000000000000000000000002";
const RANDOM_TOKEN_A = "0xrandom0000000000000000000000000000000a";
const RANDOM_TOKEN_B = "0xrandom0000000000000000000000000000000b";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const V3_POOL = "0xv3pool00000000000000000000000000000001";
const V4_POOL_ID = "0xv4pool00000000000000000000000000000000000000000000000000000001";
const NON_RWA_POOL = "0xnonrwapool000000000000000000000000001";
const WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

let dbServer: Server;

beforeAll(async () => {
  dbServer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const table = url.pathname.replace("/rest/v1/", "");
    res.setHeader("Content-Type", "application/json");

    if (table === "rwa_tokens") {
      const tickerFilter = url.searchParams.get("underlying_ticker"); // "eq.NVDA" style, from .eq("underlying_ticker", ticker)
      const rows = [{ address: RWA_TOKEN, underlying_ticker: "NVDA" }];
      res.end(JSON.stringify(tickerFilter ? rows.filter((r) => tickerFilter === `eq.${r.underlying_ticker}`) : rows));
      return;
    }
    if (table === "indexer_pools") {
      res.end(
        JSON.stringify([
          { pool_address: V3_POOL, pool_id: null, token0: USDG, token1: RWA_TOKEN },
          { pool_address: null, pool_id: V4_POOL_ID, token0: WETH, token1: OTHER_RWA_TOKEN },
          { pool_address: NON_RWA_POOL, pool_id: null, token0: RANDOM_TOKEN_A, token1: RANDOM_TOKEN_B },
        ])
      );
      return;
    }
    if (table === "indexer_swaps") {
      const poolAddressFilter = url.searchParams.get("pool_address");
      const poolIdFilter = url.searchParams.get("pool_id");
      if (poolAddressFilter?.includes(V3_POOL)) {
        res.end(
          JSON.stringify([{ recipient: WALLET, amount0: "100000000", amount1: "-500000000000000000000", pool_address: V3_POOL }])
        );
        return;
      }
      if (poolIdFilter?.includes(V4_POOL_ID)) {
        res.end(JSON.stringify([])); // no swaps on the v4 pool in this test — just proves it was queried without erroring
        return;
      }
      res.end(JSON.stringify([]));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => dbServer.listen(0, "127.0.0.1", resolve));
  const port = (dbServer.address() as AddressInfo).port;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.GECKOTERMINAL_API_URL = "http://127.0.0.1:1"; // unreachable on purpose — WETH pricing is best-effort, this test only needs USDG
});

afterAll(() => {
  dbServer.close();
});

describe("GET /api/rwa/scanner/smart-money", () => {
  it("only counts swaps from pools that actually involve a verified RWA token, priced via USDG", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/rwa/scanner/smart-money") as never);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.indexed).toBe(true);
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0].wallet).toBe(WALLET.toLowerCase());
    expect(json.rows[0].tickers).toEqual(["NVDA"]);
    expect(json.rows[0].trades).toBe(1);
  });

  it("narrows to one ticker's tokens when ?ticker= is given", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/rwa/scanner/smart-money?ticker=tsla") as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    // TSLA isn't RWA_TOKEN's ticker (NVDA is) — nothing to find.
    expect(json.rows).toEqual([]);
  });
});
