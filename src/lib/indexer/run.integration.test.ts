import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encodeAbiParameters, pad, toEventSelector, toHex } from "viem";

/**
 * End-to-end pass against a scripted JSON-RPC node AND a scripted
 * PostgREST server standing in for Supabase — same strategy as
 * token-security.integration.test.ts (real API unreachable from this
 * sandbox), extended to also cover the write side (upserts, checkpoint
 * advance), since this is the first thing in the codebase that writes
 * to a database rather than only reading and returning.
 *
 * Swap scanning is address-filtered against known pools (scan.ts) — a
 * real deployed run found that an unfiltered, chain-wide getLogs call
 * for the Swap topic was rejected outright by this chain's public RPC.
 * This mock's eth_getLogs only returns a Swap log when the queried
 * address filter actually includes it, the same way a real filtered
 * RPC would, so the test proves the address list built from
 * indexer_pools is what drives what gets found — not a wildcard scan.
 */

const FACTORY = "0x1f7d7550b1b028f7571e69a784071f0205fd2efa"; // lowercased for topic/address comparisons below
// EIP-55 checksummed — decoded log addresses come back checksummed from
// viem regardless of input casing, so the expected value has to match.
const POOL_ADDRESS = "0x0000000000000000000000000000000000000aBc";
const TOKEN0 = "0x1111111111111111111111111111111111111111";
const TOKEN1 = "0x2222222222222222222222222222222222222222";
const SENDER = "0x3333333333333333333333333333333333333333";
const RECIPIENT = "0x4444444444444444444444444444444444444444";

const HEAD_BLOCK = 100n;

const POOL_CREATED_TOPIC = toEventSelector(
  "PoolCreated(address,address,uint24,int24,address)"
);
const SWAP_TOPIC = toEventSelector(
  "Swap(address,address,int256,int256,uint160,uint128,int24)"
);

function topicFor(address: string): string {
  return pad(address as `0x${string}`, { size: 32 });
}

function poolCreatedLog() {
  return {
    address: FACTORY,
    topics: [
      POOL_CREATED_TOPIC,
      topicFor(TOKEN0),
      topicFor(TOKEN1),
      pad(toHex(3000), { size: 32 }),
    ],
    data: encodeAbiParameters(
      [{ type: "int24" }, { type: "address" }],
      [60, POOL_ADDRESS as `0x${string}`]
    ),
    blockNumber: toHex(50n),
    blockHash: pad("0xaaa", { size: 32 }),
    transactionHash: pad("0xpoolcreated", { size: 32 }),
    transactionIndex: "0x0",
    logIndex: "0x0",
    removed: false,
  };
}

function swapLog(emitter: string, blockNumber: bigint, logIndex: number, txHash: `0x${string}`) {
  return {
    address: emitter,
    topics: [SWAP_TOPIC, topicFor(SENDER), topicFor(RECIPIENT)],
    data: encodeAbiParameters(
      [
        { type: "int256" },
        { type: "int256" },
        { type: "uint160" },
        { type: "uint128" },
        { type: "int24" },
      ],
      [1_000_000000000000000000n, -500_000000n, 1234567890123456789n, 999n, -100]
    ),
    blockNumber: toHex(blockNumber),
    blockHash: pad("0xbbb", { size: 32 }),
    transactionHash: pad(txHash, { size: 32 }),
    transactionIndex: "0x0",
    logIndex: toHex(BigInt(logIndex)),
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
      const [filter] = params as [{ address?: string | string[]; topics?: string[] }];
      const topic0 = filter.topics?.[0];
      if (topic0 === POOL_CREATED_TOPIC) return [poolCreatedLog()];
      if (topic0 === SWAP_TOPIC) {
        const addresses = (Array.isArray(filter.address) ? filter.address : [filter.address ?? ""]).map(
          (a) => a.toLowerCase()
        );
        if (addresses.includes(POOL_ADDRESS.toLowerCase())) {
          return [swapLog(POOL_ADDRESS, 60n, 0, "0xswapfrompool")];
        }
        return [];
      }
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
        miner: SENDER,
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
    default:
      throw new Error(`unexpected RPC method: ${method}`);
  }
}

/** Captures every write the code makes, so tests can assert on exactly what would have hit Supabase. */
const writes: { table: string; op: "upsert" | "update"; body: unknown; query: string }[] = [];

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
        res.end(JSON.stringify({ pools_synced_to_block: 0, swaps_synced_to_block: 0 }));
        return;
      }
      // Pretends the pool discovered this same run was already known —
      // simplest way to exercise the address-filter path without also
      // making this mock stateful across the upsert that precedes it.
      if (req.method === "GET" && table === "indexer_pools") {
        res.end(JSON.stringify([{ pool_address: POOL_ADDRESS }]));
        return;
      }
      if (req.method === "POST") {
        writes.push({ table, op: "upsert", body: JSON.parse(raw), query: url.search });
        res.end("[]");
        return;
      }
      if (req.method === "PATCH") {
        writes.push({ table, op: "update", body: JSON.parse(raw), query: url.search });
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

describe("runIndexerPass against a scripted node and a scripted Supabase", () => {
  it("discovers the pool, captures its swap via the address-filtered scan, and advances the checkpoint", async () => {
    const { runIndexerPass } = await import("./run");
    const result = await runIndexerPass();

    expect(result.status).toBe("ok");
    expect(result.headBlock).toBe(HEAD_BLOCK.toString());
    expect(result.pools?.discovered).toBe(1);
    expect(result.swaps?.found).toBe(1);
    // Scanned the whole 0..100 range in one chunk (well under CHUNK_BLOCKS
    // and well inside the lookback window, since head is tiny here).
    expect(result.pools?.syncedTo).toBe(HEAD_BLOCK.toString());
    expect(result.swaps?.syncedTo).toBe(HEAD_BLOCK.toString());
    expect(result.pools?.partial).toBe(false);
    expect(result.swaps?.partial).toBe(false);

    const poolWrite = writes.find((w) => w.table === "indexer_pools");
    expect(poolWrite).toBeDefined();
    const poolRows = poolWrite!.body as Record<string, unknown>[];
    expect(poolRows).toHaveLength(1);
    expect(poolRows[0].pool_address).toBe(POOL_ADDRESS);
    expect(poolRows[0].token0).toBe(TOKEN0);
    expect(poolRows[0].token1).toBe(TOKEN1);
    expect(poolRows[0].fee).toBe(3000);
    expect(poolRows[0].created_block).toBe("50");

    const swapWrite = writes.find((w) => w.table === "indexer_swaps");
    expect(swapWrite).toBeDefined();
    const swapRows = swapWrite!.body as Record<string, unknown>[];
    expect(swapRows).toHaveLength(1);
    expect(swapRows[0].pool_address).toBe(POOL_ADDRESS);
    expect(swapRows[0].amount0).toBe("1000000000000000000000");
    expect(swapRows[0].amount1).toBe("-500000000");
    expect(swapRows[0].tick).toBe(-100);
    expect(swapRows[0].block_timestamp).toBe(new Date(1_800_000_000_000).toISOString());

    const stateWrite = writes.find((w) => w.table === "indexer_state");
    expect(stateWrite).toBeDefined();
    expect((stateWrite!.body as Record<string, unknown>).pools_synced_to_block).toBe(
      HEAD_BLOCK.toString()
    );
    expect((stateWrite!.body as Record<string, unknown>).swaps_synced_to_block).toBe(
      HEAD_BLOCK.toString()
    );
  });
});
