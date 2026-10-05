import { createHash, randomBytes } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/auevo/key-encryption";

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

const ORBIO_KEY_RE = /^sk-orbio-/;

/**
 * Persists an agent owner's own Orbio (orbio.so) API key, encrypted —
 * see migration 0035 and key-encryption.ts. Called once, from
 * create-hosted's own insert of the agent's key row, never updated after
 * (an owner who wants a different key creates a new agent, same as a
 * registered agent can't change its controller_address after the fact).
 */
export function isLikelyOrbioKey(value: string): boolean {
  return ORBIO_KEY_RE.test(value) && value.length >= 12 && value.length <= 200;
}

/**
 * Looks up and decrypts a hosted agent's own Orbio key, if it ever set
 * one — this is what lets the executor (src/lib/auevo/executor.ts) run
 * on the owner's account instead of AUEVO's. Returns null for every
 * agent that never supplied a key, which is the common case and keeps
 * the executor's previous (AUEVO-pays, two-model) behavior unchanged.
 * The model to call is still read from social_agents.model as always —
 * byok_model (set at creation) is kept only as an audit record of what
 * was chosen at BYOK signup time, not re-read here.
 */
export async function getHostedAgentOrbioKey(supabase: SupabaseClient, agentId: string): Promise<string | null> {
  const { data } = await supabase
    .from("auevo_hosted_agent_keys")
    .select("orbio_api_key_enc")
    .eq("agent_id", agentId)
    .maybeSingle();
  if (!data?.orbio_api_key_enc) return null;
  return decryptSecret(data.orbio_api_key_enc);
}
