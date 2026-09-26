import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { toFunctionSelector } from "viem";

/**
 * Exercises the real runRiskPass() against a scripted Supabase (PostgREST)
 * server and a scripted JSON-RPC server standing in for Robinhood Chain —
 * same strategy as run-prices.integration.test.ts. The scanning logic
 * itself (proxy-following, capability detection, scoring) is already
 * covered thoroughly by risk.test.ts's unit tests against a fake
 * EvmReadClient; this test is about the orchestration on top: which
 * tokens are due for a (re)scan, and that one token's RPC failure doesn't
 * stop the rest of the run.
 */

const FRESH_TOKEN = "0x1111111111111111111111111111111111111111"; // checked recently — skipped
const STALE_TOKEN = "0x2222222222222222222222222222222222222222"; // checked long ago — due
const NEW_TOKEN = "0x3333333333333333333333333333333333333333"; // never checked — due
const BROKEN_TOKEN = "0x4444444444444444444444444444444444444444"; // its RPC calls all error

const MINT_SELECTOR = toFunctionSelector("mint(address,uint256)");
const PLAIN_CODE = `0x63${MINT_SELECTOR.slice(2)}00`; // a tiny dispatcher exposing just mint()

let dbServer: Server;
let rpcServer: Server;
let upsertedRows: Record<string, unknown>[] = [];

beforeEach(() => {
  upsertedRows = [];
});

beforeAll(async () => {
  dbServer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const table = url.pathname.replace("/rest/v1/", "");
    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && table === "rwa_tokens") {
      res.end(
        JSON.stringify([
          { chain_id: 4663, address: FRESH_TOKEN },
          { chain_id: 4663, address: STALE_TOKEN },
          { chain_id: 4663, address: NEW_TOKEN },
          { chain_id: 4663, address: BROKEN_TOKEN },
        ])
      );
      return;
    }

    if (req.method === "GET" && table === "rwa_risk") {
      res.end(
        JSON.stringify([
          { chain_id: 4663, token_address: FRESH_TOKEN, checked_at: new Date().toISOString() },
          { chain_id: 4663, token_address: STALE_TOKEN, checked_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
        ])
      );
      return;
    }

    if (req.method === "POST" && table === "rwa_risk") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const parsed = JSON.parse(body);
        upsertedRows.push(...(Array.isArray(parsed) ? parsed : [parsed]));
        res.statusCode = 201;
        res.end("[]");
      });
      return;
    }

    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => dbServer.listen(0, "127.0.0.1", resolve));

  rpcServer = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const { method, params, id } = JSON.parse(body);
      res.setHeader("Content-Type", "application/json");

      const address = params?.[0]?.to ?? params?.[0];
      const isBroken = typeof address === "string" && address.toLowerCase() === BROKEN_TOKEN.toLowerCase();

      if (isBroken) {
        res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message: "node error" } }));
        return;
      }

      if (method === "eth_getCode") {
        res.end(JSON.stringify({ jsonrpc: "2.0", id, result: PLAIN_CODE }));
        return;
      }
      if (method === "eth_getStorageAt") {
        res.end(JSON.stringify({ jsonrpc: "2.0", id, result: `0x${"0".repeat(64)}` }));
        return;
      }
      if (method === "eth_call") {
        res.end(JSON.stringify({ jsonrpc: "2.0", id, result: "0x" }));
        return;
      }
      res.end(JSON.stringify({ jsonrpc: "2.0", id, result: null }));
    });
  });
  await new Promise<void>((resolve) => rpcServer.listen(0, "127.0.0.1", resolve));

  const dbPort = (dbServer.address() as AddressInfo).port;
  const rpcPort = (rpcServer.address() as AddressInfo).port;
  process.env.SUPABASE_URL = `http://127.0.0.1:${dbPort}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.ROBINHOOD_RPC_URL = `http://127.0.0.1:${rpcPort}`;
});

afterAll(() => {
  dbServer.close();
  rpcServer.close();
});

describe("runRiskPass", () => {
  it("rescans only stale/never-checked tokens and keeps going after one token's RPC fails", async () => {
    const { resetEvmClientCache } = await import("./evm-clients");
    resetEvmClientCache();
    const { runRiskPass } = await import("./run-risk");

    const result = await runRiskPass();

    expect(result.status).toBe("ok");
    expect(result.due).toBe(3); // STALE_TOKEN, NEW_TOKEN, BROKEN_TOKEN — FRESH_TOKEN skipped
    expect(result.scanned).toBe(2);
    expect(result.failed).toBe(1);

    const upsertedAddresses = upsertedRows.map((r) => r.token_address);
    expect(upsertedAddresses).toContain(STALE_TOKEN);
    expect(upsertedAddresses).toContain(NEW_TOKEN);
    expect(upsertedAddresses).not.toContain(FRESH_TOKEN);
    expect(upsertedAddresses).not.toContain(BROKEN_TOKEN);

    const staleRow = upsertedRows.find((r) => r.token_address === STALE_TOKEN);
    expect(staleRow).toMatchObject({ chain_id: 4663 });
    // canMint has no dedicated rwa_risk column (see run-risk.ts's doc comment) — it lives in raw.
    expect((staleRow?.raw as { canMint: boolean }).canMint).toBe(true);
  });
});
