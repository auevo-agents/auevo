import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encodeAbiParameters, toFunctionSelector } from "viem";
import { USDG } from "./dex/addresses";
import { buildPoolKey, poolId } from "./dex/pool-key";

/**
 * Exercises runPricesPass()'s on-chain price source for Robinhood Chain
 * (pools.ts's computeTokenPriceUsdFromPool, wired in run-prices.ts) —
 * kept in its own file rather than alongside run-prices.integration.test.ts's
 * GeckoTerminal-only scenario, since lib/supabase.ts and lib/evm/client.ts
 * both cache their client off env vars read at first use; two scenarios
 * that need *different* SUPABASE_URL/ROBINHOOD_RPC_URL values in the same
 * file would fight over that cache once both describe blocks' dynamic
 * `import("./run-prices")` resolve to the same already-evaluated module.
 * A fresh file gets a fresh module graph (same isolation every other
 * *.integration.test.ts file in this app already relies on).
 */

const TOKEN_ONCHAIN = "0x9999999999999999999999999999999999999999"; // > USDG numerically -> USDG is currency0
const TOKEN_DECIMALS = 18;
const Q96 = 2n ** 96n;
// price_raw = 5e9 rebases (18-decimal token vs USDG's 6) to $200/token — see
// pools.ts's computeTokenPriceUsdFromPool for the derivation. A price_raw of
// 1 (ratio 1.0) would rebase to $1e12, which pools.ts now rejects as
// implausible (see its own 2026-09-28 note) — this test uses a price an
// actual pool would plausibly sit at, not that edge case (pools.test.ts
// covers the rejection itself).
const SQRT_PRICE_X96 = BigInt(Math.floor(Math.sqrt(5_000_000_000) * Number(Q96)));
const POOL_KEY = buildPoolKey(USDG, TOKEN_ONCHAIN, 3000, 60);
const POOL_ID = poolId(POOL_KEY);
const GET_SLOT0_SELECTOR = toFunctionSelector("getSlot0(bytes32)");

let dbServer: Server;
let rpcServer: Server;
let geckoServer: Server;
let insertedRows: Record<string, unknown>[] = [];

beforeAll(async () => {
  rpcServer = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const request = JSON.parse(body);
      res.setHeader("Content-Type", "application/json");
      if (request.method === "eth_call" && (request.params[0].data as string).startsWith(GET_SLOT0_SELECTOR)) {
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            result: encodeAbiParameters(
              [{ type: "uint160" }, { type: "int24" }, { type: "uint24" }, { type: "uint24" }],
              [SQRT_PRICE_X96, 0, 0, 3000]
            ),
          })
        );
        return;
      }
      res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: "0x" }));
    });
  });
  await new Promise<void>((resolve) => rpcServer.listen(0, "127.0.0.1", resolve));

  dbServer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const table = url.pathname.replace("/rest/v1/", "");
    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && table === "rwa_tokens") {
      res.end(JSON.stringify([{ chain_id: 4663, address: TOKEN_ONCHAIN, underlying_ticker: "NVDA", decimals: TOKEN_DECIMALS }]));
      return;
    }
    if (req.method === "GET" && table === "rwa_pools") {
      res.end(JSON.stringify([{ pool_id: POOL_ID, token0: POOL_KEY.currency0, token1: POOL_KEY.currency1 }]));
      return;
    }
    if (req.method === "GET" && table === "rwa_reference_prices") {
      res.end(JSON.stringify([]));
      return;
    }
    if (req.method === "POST" && table === "rwa_prices") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        insertedRows = JSON.parse(body);
        res.statusCode = 201;
        res.end("[]");
      });
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => dbServer.listen(0, "127.0.0.1", resolve));

  geckoServer = createServer((_req, res) => {
    // GeckoTerminal has nothing for this token — the exact real-world gap
    // this on-chain price source exists to close (a brand-new L2's pool
    // it hasn't indexed yet).
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => geckoServer.listen(0, "127.0.0.1", resolve));

  process.env.SUPABASE_URL = `http://127.0.0.1:${(dbServer.address() as AddressInfo).port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.GECKOTERMINAL_API_URL = `http://127.0.0.1:${(geckoServer.address() as AddressInfo).port}`;
  process.env.ROBINHOOD_RPC_URL = `http://127.0.0.1:${(rpcServer.address() as AddressInfo).port}`;
});

afterAll(() => {
  dbServer.close();
  rpcServer.close();
  geckoServer.close();
});

describe("runPricesPass — on-chain price source for Robinhood Chain", () => {
  it("prices a Robinhood-chain token straight from its own pool's on-chain state when GeckoTerminal has nothing for it", async () => {
    const { runPricesPass } = await import("./run-prices");
    const result = await runPricesPass();

    expect(result.status).toBe("ok");
    expect(result.priced).toBe(1);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({ chain_id: 4663, token_address: TOKEN_ONCHAIN });
    expect(insertedRows[0].price_usd as number).toBeCloseTo(200, 1);
  });
});
