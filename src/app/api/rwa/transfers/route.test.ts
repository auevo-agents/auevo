import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dbServer: Server;
let lastUrl: string | undefined;

beforeAll(async () => {
  dbServer = createServer((req, res) => {
    lastUrl = req.url;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify([
        {
          id: 1,
          account: "0xUser",
          recipient: "0xUser",
          chain_id: 8453,
          to_chain_id: 4663,
          src_token: "0xUSDC",
          dst_token: "0xUSDG",
          amount_in: "1000000",
          amount_out: null,
          route: "across",
          bridge_tool: "across",
          fee_bps: 0,
          tx_hash: null,
          status: "pending",
          created_at: "2026-09-26T00:00:00Z",
          updated_at: "2026-09-26T00:00:00Z",
        },
      ])
    );
  });
  await new Promise<void>((resolve) => dbServer.listen(0, "127.0.0.1", resolve));
  const port = (dbServer.address() as AddressInfo).port;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

afterAll(async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  await new Promise((resolve) => dbServer.close(resolve));
});

describe("GET /api/rwa/transfers", () => {
  it("maps a cross-chain row to camelCase, including the new bridge fields", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/rwa/transfers") as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.transfers).toHaveLength(1);
    expect(json.transfers[0]).toMatchObject({
      chainId: 8453,
      toChainId: 4663,
      bridgeTool: "across",
      status: "pending",
    });
  });

  it("filters by account when provided", async () => {
    const { GET } = await import("./route");
    await GET(new Request("http://localhost/api/rwa/transfers?account=0xUser") as never);
    expect(lastUrl ?? "").toContain("account=ilike");
  });
});
