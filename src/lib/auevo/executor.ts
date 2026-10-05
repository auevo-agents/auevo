import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase";
import { getAgentById } from "@/lib/social/db";
import { listSuggestedSkillPools, computeSkillWindow, type SuggestedSkillPool } from "@/lib/auevo/skill";
import { submitSkillAttempt, SkillSubmitError } from "@/lib/auevo/submit";
import { EXECUTOR_ALLOWED_MODELS, type ExecutorModel } from "@/lib/auevo/executor-models";

/**
 * The actual "исполнитель" the execution-plan doc's §1 asks for: given a
 * hosted agent, it gets a challenge's real conditions, calls an AI model,
 * hands it only the tools that category allows, logs the full run, and
 * passes the model's answer to the SAME independent verification code an
 * external agent's signed submission goes through (src/lib/auevo/submit.ts)
 * — never grading its own homework. A free-text manual form (the previous
 * /proofs/prediction flow) never calls this; this is what makes "Create an
 * agent" produce a working agent rather than just a labeled profile.
 */
const DEFAULT_EXECUTOR_MODEL: ExecutorModel = "claude-haiku-4-5";

const SKILL_FIXED_WINDOW_HOURS = 24; // Same horizon for every agent's run — "одинаковые условия для сравниваемых агентов" (doc §4f).
const TOOL_ROW_LIMIT = 800;
const MAX_TOOL_ROUNDS = 6;
const MAX_TOKENS = 1024;

export class ExecutorError extends Error {}

type TranscriptEntry = Record<string, unknown>;

async function resolveExecutorModel(agent: { model: string | null }): Promise<ExecutorModel> {
  return (EXECUTOR_ALLOWED_MODELS as readonly string[]).includes(agent.model ?? "") ? (agent.model as ExecutorModel) : DEFAULT_EXECUTOR_MODEL;
}

async function fetchSwapPage(
  supabase: SupabaseClient,
  dex: "uniswap_v3" | "uniswap_v4",
  poolRef: string,
  window: { windowStart: Date; windowEnd: Date },
  offset: number
): Promise<{ traderAddresses: string[]; nextOffset: number | null }> {
  const poolColumn = dex === "uniswap_v3" ? "pool_address" : "pool_id";
  const { data, error } = await supabase
    .from("indexer_swaps")
    .select("sender, recipient")
    .eq("dex", dex)
    .eq(poolColumn, poolRef.toLowerCase())
    .gte("block_timestamp", window.windowStart.toISOString())
    .lt("block_timestamp", window.windowEnd.toISOString())
    .order("block_number", { ascending: true })
    .range(offset, offset + TOOL_ROW_LIMIT - 1);
  if (error) throw error;

  // Same v3 (sender+recipient)/v4 (recipient only) extraction rule
  // countUniqueTraders itself grades against (skill.ts) — a swap row
  // contributes every address that rule counts, duplicates included, so
  // deduping and counting is genuinely left to the model.
  const traderAddresses: string[] = [];
  for (const row of data ?? []) {
    if (dex === "uniswap_v3" && row.sender) traderAddresses.push((row.sender as string).toLowerCase());
    if (row.recipient) traderAddresses.push((row.recipient as string).toLowerCase());
  }
  const nextOffset = (data?.length ?? 0) === TOOL_ROW_LIMIT ? offset + TOOL_ROW_LIMIT : null;
  return { traderAddresses, nextOffset };
}

function buildSkillSystemPrompt(pool: SuggestedSkillPool, windowHours: number, window: { windowStart: Date; windowEnd: Date }): string {
  return [
    "You are an AI agent attempting a verifiable AUEVO Skill challenge: count the number of DISTINCT wallet addresses that traded a given on-chain pool during a fixed, already-closed time window.",
    `Pool: ${pool.dex} ${pool.poolRef}${pool.pairLabel ? ` (${pool.pairLabel})` : ""}.`,
    `Window: the last ${windowHours}h, from ${window.windowStart.toISOString()} to ${window.windowEnd.toISOString()} (UTC).`,
    "Use the list_pool_swaps tool to fetch raw swap rows for this exact pool and window — it may be paginated, keep calling it with the returned nextOffset until nextOffset is null. Each call returns a list of trader addresses, one per address a swap counts (duplicates are expected and meaningful — the same wallet can trade more than once).",
    "Count the number of distinct addresses across every page, then call submit_answer with your final integer guess. Do not guess without having fetched at least one page of data. Do not call any tool other than these two.",
  ].join(" ");
}

const LIST_SWAPS_TOOL: Anthropic.Tool = {
  name: "list_pool_swaps",
  description: "Fetch a page of raw trader addresses for the pool and window stated in the system prompt. Call again with the returned nextOffset to get the next page; stop when nextOffset is null.",
  input_schema: {
    type: "object",
    properties: { offset: { type: "integer", description: "Row offset to continue from. Omit or use 0 for the first page." } },
  },
};

const SUBMIT_ANSWER_TOOL: Anthropic.Tool = {
  name: "submit_answer",
  description: "Submit your final answer: the number of distinct wallet addresses you counted.",
  input_schema: {
    type: "object",
    properties: {
      guess: { type: "integer", description: "Your final count of distinct wallet addresses.", minimum: 0 },
      reasoning: { type: "string", description: "One or two sentences on how you arrived at this count." },
    },
    required: ["guess"],
  },
};

export interface ExecutorRunOutcome {
  runId: string;
  status: "completed" | "failed";
  proofEventId: string | null;
  summary: string;
}

/**
 * Runs one Skill attempt end to end for a hosted agent: picks a real,
 * currently-active pool (the same catalog /proofs/skill's guided flow
 * suggests from), gives the model a tool to read raw chain data, and
 * grades its final answer with the exact same independent code path an
 * external agent's signed submission uses.
 */
export async function runSkillChallenge(agentId: string): Promise<ExecutorRunOutcome> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new ExecutorError("Supabase is not configured on the server");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ExecutorError("The executor is not configured on the server (no ANTHROPIC_API_KEY)");

  const agent = await getAgentById(agentId);
  if (!agent || agent.retired_at) throw new ExecutorError("Unknown or retired agent");
  if (!agent.is_hosted) throw new ExecutorError("Only a hosted (\"Create an agent\") agent can be run by AUEVO's own executor");

  const pools = await listSuggestedSkillPools(supabase);
  const candidate = pools.find((p) => p.activity !== "light") ?? pools[0];
  if (!candidate) throw new ExecutorError("No active pool is available for a Skill run right now — try again later");

  const windowHours = SKILL_FIXED_WINDOW_HOURS;
  const window = computeSkillWindow(windowHours);
  const model = await resolveExecutorModel(agent);

  const { data: runRow, error: runInsertErr } = await supabase
    .from("auevo_agent_runs")
    .insert({ agent_id: agentId, category: "skill", model, status: "running" })
    .select("id")
    .single();
  if (runInsertErr) throw runInsertErr;
  const runId = runRow.id as string;

  const transcript: TranscriptEntry[] = [];
  const anthropic = new Anthropic({ apiKey });
  const system = buildSkillSystemPrompt(candidate, windowHours, window);
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: "Work out the distinct trader count for the pool and window described in your system prompt, then call submit_answer." },
  ];

  let finalGuess: number | null = null;
  let failureReason: string | null = null;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS && finalGuess === null; round++) {
      const response = await anthropic.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system,
        tools: [LIST_SWAPS_TOOL, SUBMIT_ANSWER_TOOL],
        messages,
      });
      transcript.push({ role: "assistant", content: response.content });
      messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (toolUses.length === 0) {
        failureReason = "Model returned no tool call";
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        if (use.name === "submit_answer") {
          const input = use.input as { guess?: unknown; reasoning?: unknown };
          const guess = Number(input.guess);
          if (Number.isInteger(guess) && guess >= 0) finalGuess = guess;
          else failureReason = "submit_answer called with an invalid guess";
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: "Received." });
        } else if (use.name === "list_pool_swaps") {
          const input = use.input as { offset?: unknown };
          const offset = Number.isInteger(input.offset) ? Number(input.offset) : 0;
          const page = await fetchSwapPage(supabase, candidate.dex, candidate.poolRef, window, offset);
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(page) });
        } else {
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: "Unknown tool", is_error: true });
        }
      }
      transcript.push({ role: "user", content: toolResults });
      messages.push({ role: "user", content: toolResults });
    }
    if (finalGuess === null && !failureReason) failureReason = "Ran out of tool-call rounds without a final answer";
  } catch (err) {
    failureReason = err instanceof Error ? err.message : "Model call failed";
  }

  if (finalGuess === null) {
    await supabase
      .from("auevo_agent_runs")
      .update({ status: "failed", transcript, error: failureReason, completed_at: new Date().toISOString() })
      .eq("id", runId);
    return { runId, status: "failed", proofEventId: null, summary: failureReason ?? "Run failed" };
  }

  try {
    const { skillResult, proofEventId } = await submitSkillAttempt({
      supabase,
      agentId,
      topic: "skill",
      body: `Guessed ${finalGuess} unique traders on ${candidate.pairLabel ?? candidate.poolRef} over the last ${windowHours}h.`,
      dex: candidate.dex,
      poolRef: candidate.poolRef,
      windowHours,
      guess: finalGuess,
    });
    await supabase
      .from("auevo_agent_runs")
      .update({ status: "completed", transcript, proof_event_id: proofEventId, completed_at: new Date().toISOString() })
      .eq("id", runId);
    return {
      runId,
      status: "completed",
      proofEventId,
      summary: `Guessed ${skillResult.guess}, actual was ${skillResult.actual} — ${skillResult.verdict}.`,
    };
  } catch (err) {
    const message = err instanceof SkillSubmitError ? err.message : err instanceof Error ? err.message : "Submission failed";
    await supabase
      .from("auevo_agent_runs")
      .update({ status: "failed", transcript, error: message, completed_at: new Date().toISOString() })
      .eq("id", runId);
    return { runId, status: "failed", proofEventId: null, summary: message };
  }
}
