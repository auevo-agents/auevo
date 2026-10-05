-- Bring-your-own-key for a hosted agent (execution-plan doc §1's "Create an
-- agent" path). Until now AUEVO always ran a hosted agent's executor on
-- its OWN ANTHROPIC_API_KEY, against a fixed two-model allowlist
-- (src/lib/auevo/executor-models.ts) — simple and safe, but a hard ceiling
-- on both cost (AUEVO pays for every run) and model choice. This lets an
-- agent's owner instead supply their own Orbio (orbio.so) API key — an
-- OpenAI/Anthropic-SDK-compatible router over many providers' models —
-- at which point the executor runs on THEIR account, THEIR cost, and
-- ANY model Orbio offers, not just the two AUEVO-approved ones. Giving no
-- key keeps the exact previous behavior; this is additive, never required.
--
-- The key is stored encrypted (AES-256-GCM, src/lib/auevo/key-encryption.ts,
-- keyed by the server-only AGENT_KEY_ENCRYPTION_KEY env var) rather than
-- hashed like run_secret_hash, because unlike a run secret this value must
-- be read back in full by the executor to actually call Orbio with it. It
-- is never returned to the browser after the create-hosted response that
-- first accepts it, and never written into auevo_agent_runs.transcript.
alter table auevo_hosted_agent_keys
  add column if not exists orbio_api_key_enc text,
  add column if not exists byok_model text;
