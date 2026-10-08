import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { POST } from "./route";

let lifiServer: Server;
let lastRequestBody: unknown;

beforeAll(async () => {
  lifiServer = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      lastRequestBody = raw ? JSON.parse(raw) : null;
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/advanced/routes" && req.method === "POST") {
        res.end(JSON.stringify({ routes: [{ id: "route-1" }], unavailableRoutes: { failed: [], filteredOut: [] } }));
        return;
      }
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise<void>((resolve) => lifiServer.listen(0, "127.0.0.1", resolve));
  const port = (lifiServer.address() as AddressInfo).port;
  process.env.LIFI_API_URL = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  delete process.env.LIFI_API_URL;
  await new Promise((resolve) => lifiServer.close(resolve));
});

afterEach(() => {
  delete process.env.AUEVO_FEE_BPS;
});

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/lifi/routes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/lifi/routes", () => {
  it("rejects a request missing required fields", async () => {
    const res = await POST(makeRequest({ fromChainId: 8453 }) as never);
    expect(res.status).toBe(400);
  });

  it("forwards a valid request with integrator injected server-side", async () => {
    const res = await POST(
      makeRequest({
        fromChainId: 8453,
        fromAmount: "1000000",
        fromTokenAddress: "0xUSDC",
        fromAddress: "0xUser",
        toChainId: 4663,
        toTokenAddress: "0xUSDG",
      }) as never
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.routes).toHaveLength(1);

    expect(lastRequestBody).toMatchObject({
      fromChainId: 8453,
      toChainId: 4663,
      options: { integrator: "auevo", order: "RECOMMENDED" },
    });
  });

  it("includes a fee fraction only when AUEVO_FEE_BPS is set", async () => {
    process.env.AUEVO_FEE_BPS = "50";
    await POST(
      makeRequest({
        fromChainId: 1,
        fromAmount: "1000000",
        fromTokenAddress: "0xUSDC",
        toChainId: 8453,
        toTokenAddress: "0xUSDbC",
      }) as never
    );
    expect((lastRequestBody as { options: { fee?: number } }).options.fee).toBe(0.005);
  });
});
