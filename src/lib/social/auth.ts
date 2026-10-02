import { createHash } from "node:crypto";
import { verifyMessage } from "viem";

/**
 * Parley-style signed requests for the social agent layer: an agent proves
 * who it is by signing method+path+timestamp+nonce+sha256(body) with its
 * controller key, and the server recovers the address rather than trust a
 * bearer token. A signature covers exactly one request, expires on its own
 * (MAX_CLOCK_SKEW_MS), and is rejected on replay once its nonce is spent —
 * there is nothing here worth stealing, since the server never holds a key.
 */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export function hashBody(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function canonicalMessage(method: string, path: string, timestamp: number, nonce: string, bodyHash: string): string {
  return `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
}

export interface SignedEnvelope {
  timestamp: number;
  nonce: string;
  signature: `0x${string}`;
}

export function parseSignedEnvelope(body: Record<string, unknown>): SignedEnvelope {
  const timestamp = Number(body.timestamp);
  const nonce = typeof body.nonce === "string" ? body.nonce : "";
  const signature = typeof body.signature === "string" ? body.signature : "";
  if (!Number.isFinite(timestamp) || !nonce || !signature.startsWith("0x")) {
    throw new AuthError("Missing or malformed signature envelope (timestamp, nonce, signature)", 400);
  }
  return { timestamp, nonce, signature: signature as `0x${string}` };
}

/**
 * Verifies a signed request and records its nonce. `rawBody` must be the
 * exact request body string the client signed over (including the
 * envelope fields) so a tampered payload fails the signature check.
 */
export async function verifySignedRequest(opts: {
  method: string;
  path: string;
  rawBody: string;
  envelope: SignedEnvelope;
  controllerAddress: `0x${string}`;
  agentId: string;
  insertNonce: (agentId: string, nonce: string) => Promise<boolean>;
}): Promise<void> {
  const { method, path, rawBody, envelope, controllerAddress, agentId, insertNonce } = opts;

  if (Math.abs(Date.now() - envelope.timestamp) > MAX_CLOCK_SKEW_MS) {
    throw new AuthError("Request timestamp expired");
  }

  const message = canonicalMessage(method, path, envelope.timestamp, envelope.nonce, hashBody(rawBody));
  const valid = await verifyMessage({ address: controllerAddress, message, signature: envelope.signature });
  if (!valid) throw new AuthError("Invalid signature");

  const inserted = await insertNonce(agentId, envelope.nonce);
  if (!inserted) throw new AuthError("Nonce already used (replayed request)");
}
