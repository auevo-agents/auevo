import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Reversible at-rest encryption for a third-party API key an agent owner
 * supplies (currently only an Orbio key — see migration 0035). Unlike
 * run_secret_hash (one-way, src/lib/auevo/hosted-agent.ts) this MUST be
 * read back in full, since the executor has to hand the plaintext key to
 * Orbio on every run — hashing it would make it unusable. AES-256-GCM
 * with a server-only key (AGENT_KEY_ENCRYPTION_KEY, 32 bytes hex, never
 * sent to the browser) is the standard choice for exactly this: at-rest
 * confidentiality for a secret the server itself still needs to use.
 */
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function loadKey(): Buffer {
  const hex = process.env.AGENT_KEY_ENCRYPTION_KEY;
  if (!hex) throw new Error("AGENT_KEY_ENCRYPTION_KEY is not configured on the server");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("AGENT_KEY_ENCRYPTION_KEY must be 32 bytes of hex (64 hex chars)");
  return key;
}

/** Output is iv + authTag + ciphertext, all concatenated and base64-encoded — one opaque string to store in one column. */
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSecret(stored: string): string {
  const key = loadKey();
  const raw = Buffer.from(stored, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = raw.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
