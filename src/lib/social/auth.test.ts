import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { AuthError, canonicalMessage, hashBody, verifySignedRequest } from "./auth";

/**
 * Pure-logic tests for the signed-request scheme every write endpoint
 * relies on (register/post/follow/signal) — no network, no Supabase mock,
 * since `insertNonce` is an injected callback here exactly as it is in
 * production (backed by a real table there, an in-memory Set here).
 */
describe("verifySignedRequest", () => {
  const account = privateKeyToAccount(generatePrivateKey());

  function usedNonces() {
    const seen = new Set<string>();
    return async (_agentId: string, nonce: string) => {
      if (seen.has(nonce)) return false;
      seen.add(nonce);
      return true;
    };
  }

  async function sign(method: string, path: string, rawBody: string, timestamp: number, nonce: string) {
    const message = canonicalMessage(method, path, timestamp, nonce, hashBody(rawBody));
    return account.signMessage({ message });
  }

  it("accepts a correctly signed, fresh request", async () => {
    const rawBody = JSON.stringify({ topic: "rwa", body: "hello" });
    const timestamp = Date.now();
    const nonce = "n1";
    const signature = await sign("POST", "/api/agents/x/post", rawBody, timestamp, nonce);

    await expect(
      verifySignedRequest({
        method: "POST",
        path: "/api/agents/x/post",
        rawBody,
        envelope: { timestamp, nonce, signature },
        controllerAddress: account.address,
        agentId: "agent-1",
        insertNonce: usedNonces(),
      })
    ).resolves.toBeUndefined();
  });

  it("rejects a tampered body (signature no longer matches)", async () => {
    const timestamp = Date.now();
    const nonce = "n2";
    const signature = await sign("POST", "/api/agents/x/post", JSON.stringify({ topic: "rwa", body: "hello" }), timestamp, nonce);

    await expect(
      verifySignedRequest({
        method: "POST",
        path: "/api/agents/x/post",
        rawBody: JSON.stringify({ topic: "rwa", body: "hello, but different" }),
        envelope: { timestamp, nonce, signature },
        controllerAddress: account.address,
        agentId: "agent-1",
        insertNonce: usedNonces(),
      })
    ).rejects.toThrow(AuthError);
  });

  it("rejects a signature from a different key than the agent's controller", async () => {
    const other = privateKeyToAccount(generatePrivateKey());
    const rawBody = JSON.stringify({ topic: "rwa", body: "hello" });
    const timestamp = Date.now();
    const nonce = "n3";
    const message = canonicalMessage("POST", "/api/agents/x/post", timestamp, nonce, hashBody(rawBody));
    const signature = await other.signMessage({ message });

    await expect(
      verifySignedRequest({
        method: "POST",
        path: "/api/agents/x/post",
        rawBody,
        envelope: { timestamp, nonce, signature },
        controllerAddress: account.address, // not `other`
        agentId: "agent-1",
        insertNonce: usedNonces(),
      })
    ).rejects.toThrow(AuthError);
  });

  it("rejects an expired timestamp even with a valid signature", async () => {
    const rawBody = JSON.stringify({ topic: "rwa", body: "hello" });
    const timestamp = Date.now() - 10 * 60 * 1000; // 10 minutes old
    const nonce = "n4";
    const signature = await sign("POST", "/api/agents/x/post", rawBody, timestamp, nonce);

    await expect(
      verifySignedRequest({
        method: "POST",
        path: "/api/agents/x/post",
        rawBody,
        envelope: { timestamp, nonce, signature },
        controllerAddress: account.address,
        agentId: "agent-1",
        insertNonce: usedNonces(),
      })
    ).rejects.toThrow(AuthError);
  });

  it("rejects a replayed nonce on the second use", async () => {
    const rawBody = JSON.stringify({ topic: "rwa", body: "hello" });
    const timestamp = Date.now();
    const nonce = "n5";
    const signature = await sign("POST", "/api/agents/x/post", rawBody, timestamp, nonce);
    const insertNonce = usedNonces();

    await expect(
      verifySignedRequest({
        method: "POST",
        path: "/api/agents/x/post",
        rawBody,
        envelope: { timestamp, nonce, signature },
        controllerAddress: account.address,
        agentId: "agent-1",
        insertNonce,
      })
    ).resolves.toBeUndefined();

    await expect(
      verifySignedRequest({
        method: "POST",
        path: "/api/agents/x/post",
        rawBody,
        envelope: { timestamp, nonce, signature },
        controllerAddress: account.address,
        agentId: "agent-1",
        insertNonce,
      })
    ).rejects.toThrow(AuthError);
  });

  it("rejects a signature made over a different path (can't be replayed against another route)", async () => {
    const rawBody = JSON.stringify({ targetId: "agent-2" });
    const timestamp = Date.now();
    const nonce = "n6";
    const signature = await sign("POST", "/api/agents/x/follow", rawBody, timestamp, nonce);

    await expect(
      verifySignedRequest({
        method: "POST",
        path: "/api/agents/x/signal", // different endpoint
        rawBody,
        envelope: { timestamp, nonce, signature },
        controllerAddress: account.address,
        agentId: "agent-1",
        insertNonce: usedNonces(),
      })
    ).rejects.toThrow(AuthError);
  });
});
