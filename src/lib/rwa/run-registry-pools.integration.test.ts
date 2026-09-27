import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encodeAbiParameters, pad, toEventSelector, toFunctionSelector, toHex } from "viem";
import { USDG, STATE_VIEW } from "./dex/addresses";
import { buildPoolKey, poolId } from "./dex/pool-key";

/**
 * Exercises runRegistryPass()'s rwa_pools side end to end: a discovered
 * v4 USDG pool gets upserted into rwa_pools, then refreshPoolMetrics
 * reads StateView (sqrtPrice + liquidity), the token's latest reference
 * price, and its last 24h of indexed swaps, and writes back
 * liquidity_usd/volume_24h_usd. Same scripted-server strategy as
 * run-registry.integration.test.ts (that file's own token-discovery
 * assertions are untouched by this one — see its updated comment).
 */

const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const NVDA_TOKEN = "0x9999999999999999999999999999999999999999"; // > USDG numerically -> USDG is currency0
const HEAD_BLOCK = 100n;
const NVDA_PRICE_USD = 500;
const SQRT_PRICE_1_0 = 79228162514264337593543950336n; // price = 1.0 in Q96
const LIQUIDITY = 1_000_000_000n; // chosen so amount0 (USDG, 6dp) = 1000 exactly at price 1.0

const POOL_KEY = buildPoolKey(USDG, NVDA_TOKEN, 3000, 60);
const POOL_ID = poolId(POOL_KEY);

const INITIALIZE_TOPIC = toEventSelector("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");
const SYMBOL_SELECTOR = toFunctionSelector("symbol()");
const DECIMALS_SELECTOR = toFunctionSelector("decimals()");
const GET_SLOT0_SELECTOR = toFunctionSelector("getSlot0(bytes32)");
const GET_LIQUIDITY_SELECTOR = toFunctionSelector("getLiquidity(bytes32)");

function topicFor(address: string): string {
  return pad(address as `0x${string}`, { size: 32 });
}

function initializeLog() {
  return {
    address: POOL_MANAGER,
    topics: [INITIALIZE_TOPIC, POOL_ID, topicFor(USDG), topicFor(NVDA_TOKEN)],
    data: encodeAbiParameters(
      [{ type: "uint24" }, { type: "int24" }, { type: "address" }, { type: "uint160" }, { type: "int24" }],
      [3000, 60, "0x0000000000000000000000000000000000000000", SQRT_PRICE_1_0, 0]
    ),
    blockNumber: toHex(50n),
    blockHash: pad("0xaaa", { size: 32 }),
    transactionHash: pad("0xinit", { size: 32 }),
    transactionIndex: "0x0",
    logIndex: "0x0",
    removed: false,
  };
}

function encodedString(value: string): string {
  return encodeAbiParameters([{ type: "string" }], [value]);
}

let rpcServer: Server;
let dbServer: Server;
let xstocksServer: Server;
const upsertedPools: Record<string, unknown>[] = [];
const poolUpdates: Record<string, unknown>[] = [];
const registryStateUpdates: Record<string, unknown>[] = [];
let failPoolsUpsert = false;

beforeAll(async () => {
  rpcServer = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const request = JSON.parse(body);
      res.setHeader("Content-Type", "application/json");

      if (request.method === "eth_chainId") {
        res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: "0x1237" }));
        return;
      }
      if (request.method === "eth_blockNumber") {
        res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: toHex(HEAD_BLOCK) }));
        return;
      }
      if (request.method === "eth_getLogs") {
        const topics = request.params[0].topics as (string | null)[];
        const filtersCurrency0 = Boolean(topics[2]);
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            result: filtersCurrency0 ? [initializeLog()] : [],
          })
        );
        return;
      }
      if (request.method === "eth_call") {
        const data = request.params[0].data as string;
        const to = (request.params[0].to as string).toLowerCase();
        if (data.startsWith(SYMBOL_SELECTOR)) {
          res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: encodedString("NVDA") }));
          return;
        }
        if (data.startsWith(DECIMALS_SELECTOR)) {
          res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: pad(toHex(18), { size: 32 }) }));
          return;
        }
        if (to === STATE_VIEW.toLowerCase() && data.startsWith(GET_SLOT0_SELECTOR)) {
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              result: encodeAbiParameters(
                [{ type: "uint160" }, { type: "int24" }, { type: "uint24" }, { type: "uint24" }],
                [SQRT_PRICE_1_0, 0, 0, 3000]
              ),
            })
          );
          return;
        }
        if (to === STATE_VIEW.toLowerCase() && data.startsWith(GET_LIQUIDITY_SELECTOR)) {
          res.end(
            JSON.stringify({ jsonrpc: "2.0", id: request.id, result: pad(toHex(LIQUIDITY), { size: 32 }) })
          );
          return;
        }
        res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: "0x" }));
        return;
      }

      res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: null }));
    });
  });
  await new Promise<void>((resolve) => rpcServer.listen(0, "127.0.0.1", resolve));

  dbServer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const table = url.pathname.replace("/rest/v1/", "");
    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && table === "rwa_underlyings") {
      res.end(JSON.stringify([{ ticker: "NVDA" }]));
      return;
    }
    if (req.method === "GET" && table === "rwa_registry_state") {
      res.end(JSON.stringify({ synced_to_block: 0 }));
      return;
    }
    if (req.method === "PATCH" && table === "rwa_registry_state") {
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => {
        registryStateUpdates.push(JSON.parse(b));
        res.end("[]");
      });
      return;
    }
    if (req.method === "POST" && table === "rwa_tokens") {
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => {
        res.statusCode = 201;
        res.end("[]");
      });
      return;
    }
    if (req.method === "GET" && table === "rwa_tokens") {
      const select = url.searchParams.get("select") ?? "";
      if (select.includes("address")) {
        // backfillMissingPools' own "every verified Robinhood-chain token" read.
        res.end(JSON.stringify([{ address: NVDA_TOKEN }]));
        return;
      }
      // refreshPoolMetrics' own per-pool decimals lookup (.maybeSingle()).
      res.end(JSON.stringify({ decimals: 18 }));
      return;
    }
    if (req.method === "POST" && table === "rwa_pools") {
      if (failPoolsUpsert) {
        // Simulates the real production failure this test guards against:
        // a raw network-level fetch failure, not a structured PostgREST
        // error — a dropped connection is the closest a test server can
        // get to that without a real network layer.
        req.socket.destroy();
        return;
      }
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => {
        upsertedPools.push(...JSON.parse(b));
        res.statusCode = 201;
        res.end("[]");
      });
      return;
    }
    if (req.method === "GET" && table === "rwa_pools") {
      res.end(
        JSON.stringify(
          upsertedPools.map((p) => ({ pool_id: p.pool_id, token0: p.token0, token1: p.token1, fee: p.fee }))
        )
      );
      return;
    }
    if (req.method === "PATCH" && table === "rwa_pools") {
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => {
        poolUpdates.push(JSON.parse(b));
        res.end("[]");
      });
      return;
    }
    if (req.method === "GET" && table === "rwa_prices") {
      res.end(JSON.stringify([{ token_address: NVDA_TOKEN, price_usd: NVDA_PRICE_USD, ts: new Date().toISOString() }]));
      return;
    }
    if (req.method === "GET" && table === "indexer_swaps") {
      res.end(
        JSON.stringify([
          { pool_id: POOL_ID, amount0: "500000000", amount1: "-1000000000000000000" },
          { pool_id: POOL_ID, amount0: "-300000000", amount1: "600000000000000000" },
        ])
      );
      return;
    }

    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => dbServer.listen(0, "127.0.0.1", resolve));

  xstocksServer = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ tokens: [] }));
  });
  await new Promise<void>((resolve) => xstocksServer.listen(0, "127.0.0.1", resolve));

  const rpcPort = (rpcServer.address() as AddressInfo).port;
  const dbPort = (dbServer.address() as AddressInfo).port;
  const xstocksPort = (xstocksServer.address() as AddressInfo).port;
  process.env.ROBINHOOD_RPC_URL = `http://127.0.0.1:${rpcPort}`;
  process.env.SUPABASE_URL = `http://127.0.0.1:${dbPort}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.XSTOCKS_TOKENLIST_URL = `http://127.0.0.1:${xstocksPort}`;
});

afterAll(() => {
  rpcServer.close();
  dbServer.close();
  xstocksServer.close();
});

describe("runRegistryPass — rwa_pools discovery and metrics refresh", () => {
  it("upserts the discovered pool and refreshes its liquidity/volume", async () => {
    const { runRegistryPass } = await import("./run-registry");
    const result = await runRegistryPass();

    expect(result.status).toBe("ok");
    expect(upsertedPools).toHaveLength(1);
    expect(upsertedPools[0]).toMatchObject({
      chain_id: 4663,
      pool_id: POOL_ID,
      dex: "uniswap_v4",
      token0: POOL_KEY.currency0,
      token1: POOL_KEY.currency1,
      fee: 3000,
      tick_spacing: 60,
    });

    expect(result.pools?.refreshed).toBe(1);
    expect(poolUpdates).toHaveLength(1);
    // amount0Raw = amount1Raw = LIQUIDITY at price 1.0; USDG (currency0, 6dp) -> 1000 USDG;
    // NVDA (currency1, 18dp) -> a negligible fraction of a token at $500 — liquidityUsd ~= 1000.
    expect(poolUpdates[0].liquidity_usd).toBeCloseTo(1000, 2);
    // |500 USDG| + |-300 USDG| across the two mocked swaps.
    expect(poolUpdates[0].volume_24h_usd).toBeCloseTo(800, 5);
  });

  it("still checkpoints synced_to_block and finishes the pass when the rwa_pools upsert fails", async () => {
    // Regression test for a real production incident: a run found and
    // saved real tokens (rwa_tokens succeeded), then hit a transient
    // network failure on the very next call (rwa_pools, a fresh table)
    // and the whole pass died before ever reaching the checkpoint
    // update below — meaning the same block range would be rescanned
    // forever, even after tokens were already safely saved.
    failPoolsUpsert = true;
    try {
      const { runRegistryPass } = await import("./run-registry");
      const result = await runRegistryPass();

      expect(result.status).toBe("ok");
      expect(result.robinhood?.discovered).toBe(1); // token discovery still succeeded
      expect(result.pools?.error).toContain("rwa_pools upsert failed");
      expect(registryStateUpdates.length).toBeGreaterThan(0); // the checkpoint update still ran
      expect(registryStateUpdates.at(-1)?.synced_to_block).toBe(HEAD_BLOCK.toString());
    } finally {
      failPoolsUpsert = false;
    }
  });
});
