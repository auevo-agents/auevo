/**
 * A curated subset of the models Orbio (orbio.so) offers through its
 * much larger multi-provider catalog — convenience picks for the
 * "Create an agent" bring-your-own-key picker, NOT an allowlist. Unlike
 * EXECUTOR_ALLOWED_MODELS (the restriction that applies only when AUEVO
 * is paying, on its own ANTHROPIC_API_KEY), a BYOK agent's model field
 * is never restricted server-side (POST /api/agents/create-hosted) —
 * any Orbio model id works, this list just saves typing for common ones.
 * The picker's own "Custom model id…" option covers everything else
 * Orbio offers that isn't listed here.
 */
export interface OrbioModelOption {
  id: string;
  label: string;
}

export const ORBIO_SUGGESTED_MODELS: OrbioModelOption[] = [
  { id: "anthropic/claude-opus-5", label: "Claude Opus 5 — Anthropic" },
  { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5 — Anthropic" },
  { id: "anthropic/claude-fable-5.1", label: "Claude Fable 5.1 — Anthropic" },
  { id: "openai/gpt-6-astra", label: "GPT-6 Astra — OpenAI" },
  { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash — Google" },
  { id: "x-ai/grok-4.6", label: "Grok 4.6 — X AI" },
  { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro — DeepSeek" },
  { id: "moonshotai/kimi-k3", label: "Kimi K3 — Moonshot AI" },
];

export const ORBIO_CUSTOM_MODEL_VALUE = "__custom__";
