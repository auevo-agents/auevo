import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Exercises runAlertsPass() end to end against a scripted Supabase
 * (PostgREST) server — same strategy as run-registry.integration.test.ts.
 * One premium alert, already above its threshold via the mocked
 * rwa_prices data loadTickerTokens assembles, is checked to fire exactly
 * once and to be idempotent against a unique-constraint conflict on a
 * second pass (the real dedupe mechanism, not re-implemented here — a
 * second insert attempt with the same dedupe_key is expected to hit the
 * same 23505 conflict Postgres would raise, which run-alerts.ts must
 * treat as "already delivered," not an error).
 */

const NVDA_TOKEN = "0x1111111111111111111111111111111111111111";

let dbServer: Server;
let insertAttempts = 0;
let insertedNotifications: Record<string, unknown>[] = [];
let alreadyFired = false; // toggled true after the first successful insert, to simulate the DB's own unique constraint on a second pass

beforeAll(async () => {
  dbServer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const table = url.pathname.replace("/rest/v1/", "");
    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && table === "alerts") {
      res.end(
        JSON.stringify([{ id: 1, account: "0xaccount", type: "premium", params: { ticker: "NVDA", thresholdBps: 100 }, channel: "web" }])
      );
      return;
    }
    if (req.method === "GET" && table === "rwa_underlyings") {
      res.end(JSON.stringify([{ ticker: "NVDA", name: "NVIDIA", category: "stock", exchange: "NASDAQ" }]));
      return;
    }
    if (req.method === "GET" && table === "rwa_tokens") {
      res.end(
        JSON.stringify([{ chain_id: 4663, address: NVDA_TOKEN, underlying_ticker: "NVDA", issuer_id: "robinhood", symbol: "NVDA", decimals: 18 }])
      );
      return;
    }
    if (req.method === "GET" && table === "rwa_prices") {
      res.end(
        JSON.stringify([{ chain_id: 4663, token_address: NVDA_TOKEN, price_usd: 150, premium_bps: 500, ts: new Date().toISOString() }])
      );
      return;
    }
    if (req.method === "GET" && table === "rwa_risk") {
      res.end(JSON.stringify([]));
      return;
    }
    if (req.method === "GET" && table === "rwa_pools") {
      res.end(JSON.stringify([]));
      return;
    }
    if (req.method === "POST" && table === "alert_notifications") {
      insertAttempts++;
      if (alreadyFired) {
        res.statusCode = 409;
        res.end(JSON.stringify({ code: "23505", message: "duplicate key value violates unique constraint" }));
        return;
      }
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => {
        insertedNotifications.push(JSON.parse(b));
        alreadyFired = true;
        res.statusCode = 201;
        res.end("[]");
      });
      return;
    }

    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => dbServer.listen(0, "127.0.0.1", resolve));

  const dbPort = (dbServer.address() as AddressInfo).port;
  process.env.SUPABASE_URL = `http://127.0.0.1:${dbPort}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

afterAll(() => {
  dbServer.close();
});

describe("runAlertsPass", () => {
  it("fires a premium alert once and stays idempotent on a second pass", async () => {
    const { runAlertsPass } = await import("./run-alerts");

    const first = await runAlertsPass();
    expect(first.status).toBe("ok");
    expect(first.fired).toBe(1);
    expect(first.delivered).toEqual({ web: 1, telegram: 0 });
    expect(insertedNotifications).toHaveLength(1);
    expect(insertedNotifications[0]).toMatchObject({ alert_id: 1, dedupe_key: expect.any(String) });

    insertedNotifications = [];
    const second = await runAlertsPass();
    expect(second.fired).toBe(1); // the evaluator still finds the condition true...
    expect(second.delivered).toEqual({ web: 0, telegram: 0 }); // ...but nothing new gets recorded (23505 conflict, swallowed)
    expect(insertAttempts).toBe(2);
  });
});
