import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Exercises the real runReferencePricesPass() against a scripted Supabase
 * (PostgREST) server and a scripted Twelve Data server — same strategy as
 * run-prices.integration.test.ts. This is the cron that keeps
 * rwa_reference_prices (migration 0016) fresh, kept deliberately separate
 * from and much less frequent than rwa-prices's own 5-minute cron — see
 * that migration's note on why (Twelve Data's 800-credit/day free tier).
 */

let dbServer: Server;
let upsertedRows: Record<string, unknown>[] | null = null;
const originalFetch = global.fetch;

beforeEach(() => {
  upsertedRows = null;
});

beforeAll(async () => {
  dbServer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const table = url.pathname.replace("/rest/v1/", "");
    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && table === "rwa_underlyings") {
      res.end(JSON.stringify([{ ticker: "NVDA" }, { ticker: "AAPL" }]));
      return;
    }

    if (req.method === "POST" && table === "rwa_reference_prices") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        upsertedRows = JSON.parse(body);
        res.statusCode = 201;
        res.end("[]");
      });
      return;
    }

    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => dbServer.listen(0, "127.0.0.1", resolve));

  process.env.SUPABASE_URL = `http://127.0.0.1:${(dbServer.address() as AddressInfo).port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

afterAll(() => {
  dbServer.close();
});

describe("runReferencePricesPass", () => {
  it("does nothing when no reference-price provider is configured", async () => {
    delete process.env.REFERENCE_PRICE_PROVIDER;

    const { runReferencePricesPass } = await import("./run-reference-prices");
    const result = await runReferencePricesPass();

    expect(result).toEqual({ status: "ok", tickersConsidered: 2, updated: 0 });
    expect(upsertedRows).toBeNull();
  });

  it("fetches every ticker in one batch call and upserts the cache", async () => {
    process.env.REFERENCE_PRICE_PROVIDER = "twelvedata";
    process.env.REFERENCE_PRICE_API_KEY = "test-key";
    // supabase-js also runs on global fetch — only stub the Twelve Data
    // call itself, or the mocked dbServer requests above get hijacked too.
    global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes("api.twelvedata.com")) {
        return new Response(JSON.stringify({ NVDA: { price: "191.23" }, AAPL: { price: "227.50" } }), { status: 200 });
      }
      return originalFetch(url as never, init);
    }) as typeof fetch;

    const { runReferencePricesPass } = await import("./run-reference-prices");
    const result = await runReferencePricesPass();

    expect(result).toEqual({ status: "ok", tickersConsidered: 2, updated: 2 });
    expect(upsertedRows).toMatchObject([
      { ticker: "NVDA", price_usd: 191.23, source: "twelvedata" },
      { ticker: "AAPL", price_usd: 227.5, source: "twelvedata" },
    ]);
  });
});
