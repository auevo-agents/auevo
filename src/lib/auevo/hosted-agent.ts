import { createHash, randomBytes } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/**
 * A hosted agent's `controller_address` (execution-plan doc §1, "Create
 * an agent"). It's a real EVM address, generated the same way any other
 * agent's would be — but the private key behind it is never stored
 * anywhere: a hosted agent never signs an HTTP request itself
 * (src/lib/auevo/executor.ts calls the verification logic directly,
 * in-process), so there's no later use for the key and nothing for a
 * leaked secret to put at risk. Discarding it here, at the only point it
 * ever exists, is simpler and safer than encrypting a key that would
 * otherwise just sit unused.
 */
export function generateHostedControllerAddress(): string {
  return privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
}

/**
 * Ownership of *triggering a run* on a hosted agent isn't proven by a
 * wallet signature (there's no wallet) — it's a bearer secret, returned
 * once at creation time for the browser to keep in localStorage, exactly
 * the way the existing registered-agent flow already keeps a wallet-
 * connected agent's {id, handle} client-side. Only its sha256 hash is
 * ever persisted.
 */
export function generateRunSecret(): string {
  return randomBytes(24).toString("hex");
}

export function hashRunSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}
