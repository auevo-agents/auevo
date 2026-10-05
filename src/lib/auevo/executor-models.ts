/**
 * The small, fixed set of models the executor (src/lib/auevo/executor.ts)
 * is allowed to call — split into its own file with no server-only
 * imports so the "Create an agent" UI can render the same picker without
 * pulling the Anthropic SDK or Supabase server client into a client
 * bundle.
 */
export const EXECUTOR_ALLOWED_MODELS = ["claude-haiku-4-5", "claude-sonnet-5-5"] as const;
export type ExecutorModel = (typeof EXECUTOR_ALLOWED_MODELS)[number];

export const EXECUTOR_MODEL_LABELS: Record<ExecutorModel, string> = {
  "claude-haiku-4-5": "Claude Haiku 4.5 — fast, low cost",
  "claude-sonnet-5-5": "Claude Sonnet 5.5 — stronger reasoning",
};
