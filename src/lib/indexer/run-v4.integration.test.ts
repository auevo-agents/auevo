import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encodeAbiParameters, pad, toEventSelector, toHex } from "viem";
import { POOL_MANAGER } from "../rwa/dex/addresses";

/**
 * The v4 half of runIndexerPass — RWA_SPEC.md Phase 6. Deliberately a
 * separate file from run.integration.test.ts (the v3 one) rather than
 * extending its shared mock: this proves the v4 path end-to-end in
 * isolation, and guarantees the pre-existing v3 test's fixtures/assertions
 * are never touched by this work (see run.ts's own comment on why v4's
 * "synced" columns default to 0 rather than assuming that test's mock
 * carries them).
 *
 * The interesting case this test actually checks: v4's PoolManager Swap
 * event has no recipient field at all (see scan-v4.ts's doc comment), so
 * attribution has to come from the enclosing transaction's `from` via a
 * separate eth_getTransactionByHash call — this mock serves that
 * explicitly, and the assertion checks the written row's `recipient` is
 * the tx sender, not the Swap event's own (router) `sender` field.
 */

const CURRENCY0 = "0x1111111111111111111111111111111111111111";
const CURRENCY1 = "0x2222222222222222222222222222222222222222";
const ROUTER = "0x3333333333333333333333333333333333333333"; // Swap event's own `sender` — a router, not the trader
const TRADER = "0x4444444444444444444444444444444444444444"; // tx.from — the real trader
const POOL_ID = pad("0xaabb", { size: 32 });
const TX_HASH = pad("0xv4swaptx", { size: 32 });

const HEAD_BLOCK = 100n;

const V4_INITIALIZE_TOPIC = toEventSelector("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");
const V4_SWAP_TOPIC = toEventSelector("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");

function topicFor(value: string): string {
  return pad(value as `0x${string}`, { size: 32 });
}

function initializeLog() {
  return {
    address: POOL_MANAGER,
    topics: [V4_INITIALIZE_TOPIC, POOL_ID, topicFor(CURRENCY0), topicFor(CURRENCY1)],
    data: encodeAbiParameters(
      [{ type: "uint24" }, { type: "int24" }, { type: "address" }, { type: "uint160" }, { type: "int24" }],
      [3000, 60, "0x0000000000000000000000000000000000000000", 1234567890123456789n, -100]
    ),
    blockNumber: toHex(40n),
    blockHash: pad("0xaaa", { size: 32 }),
    transactionHash: pad("0xv4init", { size: 32 }),
    transactionIndex: "0x0",
    logIndex: "0x0",
    removed: false,
  };
}

function swapLog() {
  return {
    address: POOL_MANAGER,
    topics: [V4_SWAP_TOPIC, POOL_ID, topicFor(ROUTER)],
    data: encodeAbiParameters(
      [{ type: "int128" }, { type: "int128" }, { type: "uint160" }, { type: "uint128" }, { type: "int24" }, { type: "uint24" }],
      [1_000_000000000000000000n, -500_000000n, 1234567890123456789n, 999n, -100, 3000]
    ),
    blockNumber: toHex(60n),
    blockHash: pad("0xbbb", { size: 32 }),
    transactionHash: TX_HASH,
    transactionIndex: "0x0",
    logIndex: "0x0",
    removed: false,
  };
}

function rpcHandle(method: string, params: unknown[]): unknown {
  switch (method) {
    case "eth_chainId":
      return "0x1237"; // 4663
    case "eth_blockNumber":
      return toHex(HEAD_BLOCK);
    case "eth_getLogs": {
      const [filter] = params as [{ address?: string; topics?: string[] }];
      const topic0 = filter.topics?.[0];
      if (topic0 === V4_INITIALIZE_TOPIC) return [initializeLog()];
      if (topic0 === V4_SWAP_TOPIC) return [swapLog()];
      return [];
    }
    case "eth_getBlockByNumber": {
      const [block] = params as [string];
      return {
        number: block,
        hash: pad("0xccc", { size: 32 }),
        parentHash: pad("0xccb", { size: 32 }),
        timestamp: toHex(1_800_000_000n),
        gasLimit: "0x0",
        gasUsed: "0x0",
        miner: ROUTER,
        transactions: [],
        uncles: [],
        difficulty: "0x0",
        extraData: "0x",
        logsBloom: `0x${"0".repeat(512)}`,
        nonce: "0x0000000000000000",
        size: "0x0",
        stateRoot: pad("0x0", { size: 32 }),
        receiptsRoot: pad("0x0", { size: 32 }),
        transactionsRoot: pad("0x0", { size: 32 }),
        sha3Uncles: pad("0x0", { size: 32 }),
      };
    }
    case "eth_getTransactionByHash": {
      const [hash] = params as [string];
      if (hash !== TX_HASH) return null;
      return {
        hash: TX_HASH,
        from: TRADER,
        to: POOL_MANAGER,
        blockNumber: toHex(60n),
        blockHash: pad("0xbbb", { size: 32 }),
        transactionIndex: "0x0",
        nonce: "0x0",
        value: "0x0",
        gas: "0x0",
        gasPrice: "0x0",
        input: "0x",
        type: "0x2",
        chainId: "0x1237",
        v: "0x0",
        r: pad("0x0", { size: 32 }),
        s: pad("0x0", { size: 32 }),
      };
    }
    default:
      throw new Error(`unexpected RPC method: ${method}`);
  }
}

const writes: { table: string; op: "upsert" | "update"; body: unknown }[] = [];

let rpcServer: Server;
let dbServer: Server;

beforeAll(async () => {
  rpcServer = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const request = JSON.parse(raw);
      const respond = (single: { id: number; method: string; params: unknown[] }) => {
        try {
          return { jsonrpc: "2.0", id: single.id, result: rpcHandle(single.method, single.params ?? []) };
        } catch (err) {
          return { jsonrpc: "2.0", id: single.id, error: { code: -32000, message: (err as Error).message } };
        }
      };
      const body = Array.isArray(request) ? request.map(respond) : respond(request);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) => rpcServer.listen(0, "127.0.0.1", resolve));
  const rpcPort = (rpcServer.address() as AddressInfo).port;

  dbServer = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const table = url.pathname.replace("/rest/v1/", "");
      res.setHeader("Content-Type", "application/json");

      if (req.method === "GET" && table === "indexer_state") {
        res.end(
          JSON.stringify({
            pools_synced_to_block: 0,
            swaps_synced_to_block: 0,
            v4_pools_synced_to_block: 0,
            v4_swaps_synced_to_block: 0,
          })
        );
        return;
      }
      if (req.method === "GET" && table === "indexer_pools") {
        res.end(JSON.stringify([])); // v3 pool list — irrelevant here, no v3 activity in this mock
        return;
      }
      if (req.method === "POST") {
        writes.push({ table, op: "upsert", body: JSON.parse(raw) });
        res.end("[]");
        return;
      }
      if (req.method === "PATCH") {
        writes.push({ table, op: "update", body: JSON.parse(raw) });
        res.end("[]");
        return;
      }
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise<void>((resolve) => dbServer.listen(0, "127.0.0.1", resolve));
  const dbPort = (dbServer.address() as AddressInfo).port;

  process.env.ROBINHOOD_RPC_URL = `http://127.0.0.1:${rpcPort}`;
  process.env.SUPABASE_URL = `http://127.0.0.1:${dbPort}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
}, 30_000);

afterAll(() => {
  rpcServer?.close();
  dbServer?.close();
});

describe("runIndexerPass — v4 pools and swaps", () => {
  it("discovers a v4 pool by pool_id and attributes its swap to tx.from, not the Swap event's own sender", async () => {
    const { runIndexerPass } = await import("./run");
    const result = await runIndexerPass();

    expect(result.status).toBe("ok");
    expect(result.v4Pools?.discovered).toBe(1);
    expect(result.v4Swaps?.found).toBe(1);
    expect(result.v4Pools?.partial).toBe(false);
    expect(result.v4Swaps?.partial).toBe(false);

    const poolWrites = writes.filter((w) => w.table === "indexer_pools").flatMap((w) => w.body as Record<string, unknown>[]);
    const v4PoolRow = poolWrites.find((r) => r.dex === "uniswap_v4");
    expect(v4PoolRow).toMatchObject({ pool_id: POOL_ID, token0: CURRENCY0, token1: CURRENCY1, fee: 3000 });
    expect(v4PoolRow?.pool_address).toBeUndefined();

    const swapWrites = writes.filter((w) => w.table === "indexer_swaps").flatMap((w) => w.body as Record<string, unknown>[]);
    const v4SwapRow = swapWrites.find((r) => r.dex === "uniswap_v4");
    expect(v4SwapRow).toMatchObject({
      pool_id: POOL_ID,
      sender: ROUTER, // the Swap event's own sender — the router, not the trader
      recipient: TRADER, // tx.from — this test's whole point
      tx_hash: TX_HASH,
    });

    const stateWrite = writes.filter((w) => w.table === "indexer_state").pop();
    expect((stateWrite!.body as Record<string, unknown>).v4_pools_synced_to_block).toBe(HEAD_BLOCK.toString());
    expect((stateWrite!.body as Record<string, unknown>).v4_swaps_synced_to_block).toBe(HEAD_BLOCK.toString());
  });
});
