import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Exercises the real runPricesPass() against a scripted Supabase
 * (PostgREST) server and a scripted GeckoTerminal server — same strategy
 * as lib/indexer/run.integration.test.ts and the wallet-activity route's
 * own test. REFERENCE_PRICE_PROVIDER is left unset, matching this app's
 * actual current deployed state (no reference-price API key configured
 * yet) — reference-price.ts's own unit tests already cover the
 * twelvedata HTTP path directly, so this test focuses on what's unique
 * to the orchestration: grouping tokens by chain, joining GeckoTerminal
 * prices back onto them, and only inserting rows that got an actual price.
 */

const TOKEN_ROBINHOOD = "0x1111111111111111111111111111111111111111"; // chain 4663
const TOKEN_ETH = "0x2222222222222222222222222222222222222222"; // chain 1
const TOKEN_UNPRICED = "0x3333333333333333333333333333333333333333"; // chain 1, GeckoTerminal has nothing for it

let dbServer: Server;
let geckoServer: Server;
let insertedRows: Record<string, unknown>[] = [];

beforeEach(() => {
  insertedRows = [];
});

beforeAll(async () => {
  dbServer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const table = url.pathname.replace("/rest/v1/", "");
    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && table === "rwa_tokens") {
      res.end(
        JSON.stringify([
          { chain_id: 4663, address: TOKEN_ROBINHOOD, underlying_ticker: "NVDA" },
          { chain_id: 1, address: TOKEN_ETH, underlying_ticker: "NVDA" },
          { chain_id: 1, address: TOKEN_UNPRICED, underlying_ticker: "TSLA" },
        ])
      );
      return;
    }

    if (req.method === "POST" && table === "rwa_prices") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
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

  geckoServer = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === `/simple/networks/robinhood/token_price/${TOKEN_ROBINHOOD}`) {
      res.end(JSON.stringify({ data: { attributes: { token_prices: { [TOKEN_ROBINHOOD.toLowerCase()]: "185.50" } } } }));
      return;
    }
    if (req.url === `/simple/networks/eth/token_price/${TOKEN_ETH},${TOKEN_UNPRICED}`) {
      // Only TOKEN_ETH gets a price back — TOKEN_UNPRICED is absent, same
      // as GeckoTerminal not having that token listed.
      res.end(JSON.stringify({ data: { attributes: { token_prices: { [TOKEN_ETH.toLowerCase()]: "190.00" } } } }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => geckoServer.listen(0, "127.0.0.1", resolve));

  const dbPort = (dbServer.address() as AddressInfo).port;
  const geckoPort = (geckoServer.address() as AddressInfo).port;
  process.env.SUPABASE_URL = `http://127.0.0.1:${dbPort}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.GECKOTERMINAL_API_URL = `http://127.0.0.1:${geckoPort}`;
  delete process.env.REFERENCE_PRICE_PROVIDER;
});

afterAll(() => {
  dbServer.close();
  geckoServer.close();
});

describe("runPricesPass", () => {
  it("prices tokens across chains via GeckoTerminal and skips ones with no price found", async () => {
    const { runPricesPass } = await import("./run-prices");
    const result = await runPricesPass();

    expect(result.status).toBe("ok");
    expect(result.tokensConsidered).toBe(3);
    expect(result.priced).toBe(2); // TOKEN_UNPRICED never got a price, so it's not inserted

    expect(insertedRows).toHaveLength(2);
    const byAddress = new Map(insertedRows.map((r) => [r.token_address, r]));
    expect(byAddress.get(TOKEN_ROBINHOOD)).toMatchObject({ chain_id: 4663, price_usd: 185.5 });
    expect(byAddress.get(TOKEN_ETH)).toMatchObject({ chain_id: 1, price_usd: 190 });
    // No reference-price provider configured — premium is unknown, not guessed.
    expect(byAddress.get(TOKEN_ROBINHOOD)?.premium_bps).toBeNull();
  });
});
