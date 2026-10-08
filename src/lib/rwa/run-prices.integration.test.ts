import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Exercises the real runPricesPass() against a scripted Supabase
 * (PostgREST) server and a scripted GeckoTerminal server — same strategy
 * as lib/indexer/run.integration.test.ts and the wallet-activity route's
 * own test. This test focuses on what's unique to the orchestration:
 * grouping tokens by chain, joining GeckoTerminal prices back onto them,
 * joining the reference-price *cache* (rwa_reference_prices, migration
 * 0016 — reference-price.ts's own unit tests cover the twelvedata HTTP
 * path that fills that cache, a separate, much-less-frequent cron), and
 * only inserting rows that got an actual on-chain price.
 */

const TOKEN_ROBINHOOD = "0x1111111111111111111111111111111111111111"; // chain 4663
const TOKEN_ETH = "0x2222222222222222222222222222222222222222"; // chain 1
const TOKEN_UNPRICED = "0x3333333333333333333333333333333333333333"; // chain 1, GeckoTerminal has nothing for it

let dbServer: Server;
let geckoServer: Server;
let insertedRows: Record<string, unknown>[] = [];
let referencePriceRows: { ticker: string; price_usd: number }[] = [];

beforeEach(() => {
  insertedRows = [];
  referencePriceRows = [];
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

    if (req.method === "GET" && table === "rwa_pools") {
      // No Robinhood-chain pools in this scenario — runPricesPass's
      // on-chain price source (see pools.ts's computeTokenPriceUsdFromPool)
      // simply has nothing to override, leaving GeckoTerminal's own
      // coverage (asserted below) untouched.
      res.end(JSON.stringify([]));
      return;
    }

    if (req.method === "GET" && table === "rwa_reference_prices") {
      res.end(JSON.stringify(referencePriceRows));
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
    // rwa_reference_prices is empty in this scenario — premium is unknown, not guessed.
    expect(byAddress.get(TOKEN_ROBINHOOD)?.premium_bps).toBeNull();
  });

  it("computes premium against a cached reference price when one exists", async () => {
    referencePriceRows = [{ ticker: "NVDA", price_usd: 180 }];

    const { runPricesPass } = await import("./run-prices");
    const result = await runPricesPass();

    expect(result.priced).toBe(2);
    const byAddress = new Map(insertedRows.map((r) => [r.token_address, r]));
    // (185.50 - 180) / 180 * 10000, rounded
    expect(byAddress.get(TOKEN_ROBINHOOD)).toMatchObject({ reference_price_usd: 180, premium_bps: 306 });
    // TSLA has no cached reference price — its token never got an on-chain
    // price either, so it isn't inserted at all, same as before.
  });
});
