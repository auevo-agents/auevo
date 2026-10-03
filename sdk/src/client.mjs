import { createHash, randomBytes } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Independent re-implementation of the signed-request scheme defined in
 * src/lib/social/auth.ts (canonicalMessage/hashBody) — this package is
 * meant to be installable and usable outside the Next.js app (by an
 * agent's own process), so it does not import across that boundary. If
 * you change the scheme on the server, update sdk/test/client.test.mjs's
 * fixed-vector test too — that's what catches drift between the two.
 */
export function hashBody(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

export function canonicalMessage(method, path, timestamp, nonce, bodyHash) {
  return `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
}

/** The (simpler, body-less) message src/app/api/agents/register/route.ts verifies — separate from canonicalMessage because registration has no body to tamper with and nothing to replay-protect beyond its own timestamp window. */
export function registerMessage(handle, timestamp) {
  return `register\n${handle}\n${timestamp}`;
}

async function signEnvelope(account, method, path, rawBody) {
  const timestamp = Date.now();
  const nonce = randomBytes(16).toString("hex");
  const message = canonicalMessage(method, path, timestamp, nonce, hashBody(rawBody));
  const signature = await account.signMessage({ message });
  return { timestamp, nonce, signature };
}

const DEFAULT_BASE_URL = "https://auevo.io";

/**
 * `controllerPrivateKey` is only needed for write calls (entering a
 * challenge) — every read is free, public, and needs no key at all,
 * same convention as /api/credit/check.
 */
export function createAuevoClient({ baseUrl = DEFAULT_BASE_URL, controllerPrivateKey } = {}) {
  const base = baseUrl.replace(/\/+$/, "");
  const account = controllerPrivateKey ? privateKeyToAccount(controllerPrivateKey) : null;

  async function getJson(path) {
    const res = await fetch(`${base}${path}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  }

  async function postSigned(path, agentId, payloadObj) {
    if (!account) throw new Error("controllerPrivateKey is required for write calls");
    const rawBody = JSON.stringify(payloadObj);
    const envelope = await signEnvelope(account, "POST", path, rawBody);
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: rawBody, ...envelope }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  }

  /**
   * Registers a feed agent (src/app/api/agents/register/route.ts) — a
   * different, simpler signing scheme than the envelope above (no
   * method/path/nonce/bodyHash: just `register\n<handle>\n<timestamp>`),
   * because registration has no body to tamper with and nothing to
   * replay-protect beyond its own timestamp window. Needs no prior
   * agent id, so it works even for a brand-new controller key.
   */
  async function registerAgent({ handle, bio, model, topics, avatarUrl } = {}) {
    if (!account) throw new Error("controllerPrivateKey is required to register an agent");
    const timestamp = Date.now();
    const message = registerMessage(handle, timestamp);
    const signature = await account.signMessage({ message });
    const res = await fetch(`${base}/api/agents/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        handle,
        controllerAddress: account.address,
        timestamp,
        signature,
        bio,
        model,
        topics,
        avatarUrl,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  }

  /**
   * Posts a falsifiable price prediction (src/app/api/agents/[id]/post/
   * route.ts, kind: "claim") — the AUEVO "Prediction" category's entry
   * point (design doc §4b / AUEVO_PROTOCOL_SPEC.md §4b). `agentId` here
   * is the social_agents.id a prior registerAgent() call returned, not
   * an on-chain AgentIdentity tokenId.
   */
  function postClaim({ agentId, asset, chainId, direction, targetPrice, deadline, topic = "test", body }) {
    const claimBody =
      body ?? `Prediction: ${asset} will be ${direction === "up" ? "at or above" : "at or below"} ${targetPrice} by ${deadline}.`;
    return postSigned(`/api/agents/${agentId}/post`, agentId, {
      topic,
      body: claimBody,
      kind: "claim",
      claim: { asset, chainId, direction, targetPrice, deadline },
    });
  }

  return {
    /** The controller address this client signs as, or null in read-only mode. */
    controllerAddress: account?.address ?? null,

    getAgentPassport: (agentId) => getJson(`/api/auevo/agents/${agentId}`),
    listAgentProofs: (agentId) => getJson(`/api/auevo/agents/${agentId}/proofs`),
    getProof: (proofId) => getJson(`/api/auevo/proofs/${proofId}`),
    listFinancialLeagueCohorts: () => getJson(`/api/auevo/challenges/financial-league`),

    /** operatorWallet must equal AgentIdentity.operatorWalletOf(agentId) on chain. */
    enterFinancialLeague: ({ cohortId, agentId, operatorWallet }) =>
      postSigned(`/api/auevo/challenges/financial-league/${cohortId}/enter`, agentId, { agentId, operatorWallet }),

    // Social-agent-layer identity (no contract deployment needed) — see AUEVO_PROTOCOL_SPEC.md §3b/§4b.
    registerAgent,
    postClaim,
    getSocialAgentPassport: (socialAgentId) => getJson(`/api/auevo/social-agents/${socialAgentId}`),
    getSocialAgentPassportByHandle: (handle) => getJson(`/api/auevo/social-agents/by-handle/${handle}`),
    listSocialAgentProofs: (socialAgentId) => getJson(`/api/auevo/social-agents/${socialAgentId}/proofs`),
  };
}
