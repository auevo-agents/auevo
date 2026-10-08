import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET } from "./route";

let lifiServer: Server;
let lastUrl: string | undefined;

beforeAll(async () => {
  lifiServer = createServer((req, res) => {
    lastUrl = req.url;
    res.setHeader("Content-Type", "application/json");
    if (req.url?.startsWith("/status")) {
      res.end(JSON.stringify({ status: "DONE", substatus: "COMPLETED" }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => lifiServer.listen(0, "127.0.0.1", resolve));
  const port = (lifiServer.address() as AddressInfo).port;
  process.env.LIFI_API_URL = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  delete process.env.LIFI_API_URL;
  await new Promise((resolve) => lifiServer.close(resolve));
});

describe("GET /api/lifi/status", () => {
  it("requires txHash or taskId", async () => {
    const res = await GET(new Request("http://localhost/api/lifi/status") as never);
    expect(res.status).toBe(400);
  });

  it("forwards txHash and optional disambiguators as query params", async () => {
    const res = await GET(
      new Request("http://localhost/api/lifi/status?txHash=0xabc&bridge=across&fromChain=8453&toChain=4663") as never
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("DONE");
    expect(lastUrl).toBe("/status?txHash=0xabc&bridge=across&fromChain=8453&toChain=4663");
  });
});
