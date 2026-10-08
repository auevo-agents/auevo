import { describe, expect, it, afterEach, vi } from "vitest";
import http, { type Server } from "node:http";
import { lifiFetch, LifiApiError, lifiFeeFraction } from "./client";

function startServer(handler: http.RequestListener): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

describe("lifiFetch", () => {
  let server: Server | undefined;

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (server) {
      await new Promise((resolve) => server!.close(resolve));
      server = undefined;
    }
  });

  it("sends the x-lifi-api-key header only when LIFI_API_KEY is set", async () => {
    let seenKey: string | undefined;
    const started = await startServer((req, res) => {
      seenKey = req.headers["x-lifi-api-key"] as string | undefined;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    server = started.server;

    vi.stubEnv("LIFI_API_KEY", "test-key-123");
    await lifiFetch("/status", { baseUrl: started.baseUrl });
    expect(seenKey).toBe("test-key-123");

    vi.stubEnv("LIFI_API_KEY", "");
    await lifiFetch("/status", { baseUrl: started.baseUrl });
    expect(seenKey).toBeUndefined();
  });

  it("builds a query string, dropping undefined/empty values", async () => {
    let seenUrl: string | undefined;
    const started = await startServer((req, res) => {
      seenUrl = req.url;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    server = started.server;

    await lifiFetch("/status", {
      baseUrl: started.baseUrl,
      query: { txHash: "0xabc", taskId: undefined, bridge: "" },
    });
    expect(seenUrl).toBe("/status?txHash=0xabc");
  });

  it("POSTs a JSON body with content-type set", async () => {
    let seenMethod: string | undefined;
    let seenContentType: string | undefined;
    let seenBody = "";
    const started = await startServer((req, res) => {
      seenMethod = req.method;
      seenContentType = req.headers["content-type"];
      req.on("data", (chunk) => (seenBody += chunk));
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    server = started.server;

    await lifiFetch("/advanced/routes", {
      baseUrl: started.baseUrl,
      method: "POST",
      body: { fromChainId: 8453 },
    });
    expect(seenMethod).toBe("POST");
    expect(seenContentType).toBe("application/json");
    expect(JSON.parse(seenBody)).toEqual({ fromChainId: 8453 });
  });

  it("throws LifiApiError with the parsed body on a non-2xx response", async () => {
    const started = await startServer((_req, res) => {
      res.writeHead(422, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "Invalid routes request." }));
    });
    server = started.server;

    await expect(lifiFetch("/advanced/routes", { baseUrl: started.baseUrl, method: "POST", body: {} })).rejects.toThrow(
      LifiApiError
    );
  });
});

describe("LifiApiError.userMessage", () => {
  it("uses the real message LI.FI's own error body carries", () => {
    const err = new LifiApiError(400, { message: "Token 4663-0x...5e19 is invalid or in deny list.", code: 1011 });
    expect(err.userMessage).toBe("Token 4663-0x...5e19 is invalid or in deny list.");
  });

  it("falls back to a generic message when the body has no message field", () => {
    expect(new LifiApiError(500, { code: 999 }).userMessage).toBe("LI.FI couldn't process this request");
    expect(new LifiApiError(500, "plain text body").userMessage).toBe("LI.FI couldn't process this request");
    expect(new LifiApiError(500, null).userMessage).toBe("LI.FI couldn't process this request");
  });
});

describe("lifiFeeFraction", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("converts basis points to a 0..1 fraction", () => {
    vi.stubEnv("AUEVO_FEE_BPS", "30");
    expect(lifiFeeFraction()).toBe(0.003);
  });

  it("returns undefined when unset or zero", () => {
    vi.stubEnv("AUEVO_FEE_BPS", "");
    expect(lifiFeeFraction()).toBeUndefined();
    vi.stubEnv("AUEVO_FEE_BPS", "0");
    expect(lifiFeeFraction()).toBeUndefined();
  });
});
