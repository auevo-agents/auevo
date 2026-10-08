import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { encodeAbiParameters, pad, toEventSelector, toFunctionSelector, toHex } from "viem";
import { USDG } from "./dex/addresses";

/**
 * Exercises the real runRegistryPass() against a scripted JSON-RPC node,
 * a scripted Supabase (PostgREST) server, and a scripted xStocks token
 * list server — same strategy as lib/indexer/run.integration.test.ts.
 *
 * The Robinhood-chain side: one v4 PoolManager Initialize log with
 * currency0 = USDG is returned only for the currency0-filtered
 * eth_getLogs call (the currency1-filtered call returns nothing),
 * proving discoverUsdgPools' two-filter merge is what actually drives
 * discovery rather than a coincidence of a shared mock response. The
 * candidate token resolves to symbol "NVDA", which matches a known
 * rwa_underlyings ticker and is expected to end up in the rwa_tokens
 * upsert; a second Initialize log resolves to a symbol NOT in
 * rwa_underlyings and must be silently skipped (never guessed into the
 * catalog).
 */

const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const NVDA_TOKEN = "0x1111111111111111111111111111111111111111";
const UNKNOWN_TOKEN = "0x2222222222222222222222222222222222222222";
const HEAD_BLOCK = 100n;

const INITIALIZE_TOPIC = toEventSelector(
  "Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)"
);
const SYMBOL_SELECTOR = toFunctionSelector("symbol()");
const DECIMALS_SELECTOR = toFunctionSelector("decimals()");

function topicFor(address: string): string {
  return pad(address as `0x${string}`, { size: 32 });
}

function initializeLog(poolIdSeed: string, currency0: string, currency1: string) {
  return {
    address: POOL_MANAGER,
    topics: [INITIALIZE_TOPIC, pad(poolIdSeed as `0x${string}`, { size: 32 }), topicFor(currency0), topicFor(currency1)],
    data: encodeAbiParameters(
      [{ type: "uint24" }, { type: "int24" }, { type: "address" }, { type: "uint160" }, { type: "int24" }],
      [3000, 60, "0x0000000000000000000000000000000000000000", 79228162514264337593543950336n, 0]
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
let upsertedRwaTokens: Record<string, unknown>[] = [];
let registryStateUpdates: Record<string, unknown>[] = [];

beforeEach(() => {
  upsertedRwaTokens = [];
  registryStateUpdates = [];
});

beforeAll(async () => {
  rpcServer = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const request = JSON.parse(body);
      res.setHeader("Content-Type", "application/json");

      if (request.method === "eth_chainId") {
        res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: "0x1237" })); // 4663
        return;
      }
      if (request.method === "eth_blockNumber") {
        res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: toHex(HEAD_BLOCK) }));
        return;
      }
      if (request.method === "eth_getLogs") {
        const topics = request.params[0].topics as (string | null)[];
        const filtersCurrency0 = Boolean(topics[2]);
        if (filtersCurrency0) {
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              result: [
                initializeLog("0xaaa", USDG, NVDA_TOKEN),
                initializeLog("0xbbb", USDG, UNKNOWN_TOKEN),
              ],
            })
          );
        } else {
          res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: [] }));
        }
        return;
      }
      if (request.method === "eth_call") {
        const data = request.params[0].data as string;
        const to = (request.params[0].to as string).toLowerCase();
        if (data.startsWith(SYMBOL_SELECTOR)) {
          const symbol = to === NVDA_TOKEN ? "NVDA" : "UNKNOWNSTOCK";
          res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: encodedString(symbol) }));
          return;
        }
        if (data.startsWith(DECIMALS_SELECTOR)) {
          res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: pad(toHex(18), { size: 32 }) }));
          return;
        }
        // name()/totalSupply() — not needed by this test, respond empty (readTokenMetadata treats this as "not implemented").
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
      res.end(JSON.stringify([{ ticker: "NVDA" }, { ticker: "TSLA" }]));
      return;
    }
    if (req.method === "GET" && table === "rwa_registry_state") {
      res.end(JSON.stringify({ synced_to_block: 0 })); // .single() shape
      return;
    }
    // Nothing claimed yet — the ticker-collision guard (run-registry.ts)
    // reads this before deciding what's safe to promote.
    if (req.method === "GET" && table === "rwa_tokens") {
      res.end(JSON.stringify([]));
      return;
    }
    if (req.method === "PATCH" && table === "rwa_registry_state") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        registryStateUpdates.push(JSON.parse(body));
        res.end("[]");
      });
      return;
    }
    if (req.method === "POST" && table === "rwa_tokens") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        upsertedRwaTokens.push(...JSON.parse(body));
        res.statusCode = 201;
        res.end("[]");
      });
      return;
    }
    // Pool discovery (run-registry.ts's own rwa_pools upsert) and the
    // metrics refresh that follows it (refreshPoolMetrics) — not this
    // test's concern (see run-registry-pools.integration.test.ts for
    // that), so an empty rwa_pools table here just makes
    // refreshPoolMetrics return immediately without needing
    // rwa_prices/indexer_swaps/rwa_tokens GET handlers at all.
    if (req.method === "POST" && table === "rwa_pools") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        res.statusCode = 201;
        res.end("[]");
      });
      return;
    }
    if (req.method === "GET" && table === "rwa_pools") {
      res.end(JSON.stringify([]));
      return;
    }

    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => dbServer.listen(0, "127.0.0.1", resolve));

  xstocksServer = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ tokens: [] })); // cross-chain side covered separately by xstocks.test.ts
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

describe("runRegistryPass", () => {
  it("discovers a USDG-paired v4 pool, matches its token to a known ticker, and skips an unmatched one", async () => {
    const { runRegistryPass } = await import("./run-registry");
    const result = await runRegistryPass();

    expect(result.status).toBe("ok");
    expect(result.robinhood?.discovered).toBe(1);
    expect(upsertedRwaTokens).toHaveLength(1);
    expect(upsertedRwaTokens[0]).toMatchObject({
      chain_id: 4663,
      address: NVDA_TOKEN,
      underlying_ticker: "NVDA",
      issuer_id: "robinhood",
      symbol: "NVDA",
      decimals: 18,
      verified: true,
    });

    expect(registryStateUpdates).toHaveLength(1);
    expect(registryStateUpdates[0].synced_to_block).toBe(HEAD_BLOCK.toString());
  });
});
