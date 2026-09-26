import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "./route";

let lifiServer: Server;

beforeAll(async () => {
  lifiServer = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/advanced/stepTransaction" && req.method === "POST") {
        const step = JSON.parse(raw);
        res.end(JSON.stringify({ ...step, transactionRequest: { to: "0xRouter", data: "0xabc", value: "0" } }));
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

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/lifi/step-transaction", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/lifi/step-transaction", () => {
  it("rejects a body that isn't a step", async () => {
    const res = await POST(makeRequest({ not: "a step" }) as never);
    expect(res.status).toBe(400);
  });

  it("round-trips a valid step and returns it with transactionRequest populated", async () => {
    const step = {
      id: "step-1",
      type: "lifi",
      tool: "across",
      action: { fromChainId: 8453, toChainId: 4663 },
      estimate: { tool: "across", fromAmount: "1", toAmount: "1", toAmountMin: "1", approvalAddress: "0xSpender", executionDuration: 30 },
      includedSteps: [],
    };
    const res = await POST(makeRequest(step) as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.transactionRequest).toEqual({ to: "0xRouter", data: "0xabc", value: "0" });
  });
});
