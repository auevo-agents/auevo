import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase";
import { getAgentById } from "@/lib/social/db";
import { listSuggestedSkillPools, computeSkillWindow, type SuggestedSkillPool } from "@/lib/auevo/skill";
import { submitSkillAttempt, SkillSubmitError, submitClaimAttempt, ClaimSubmitError } from "@/lib/auevo/submit";
import { EXECUTOR_ALLOWED_MODELS, type ExecutorModel } from "@/lib/auevo/executor-models";
import { fetchTokenPricesUsd } from "@/lib/rwa/gecko-price";
import { SPY_ADDRESS, SPY_CHAIN_ID } from "@/app/proofs/spy";

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
const PREDICTION_FIXED_HORIZON_HOURS = 24; // Same horizon for every agent's run, same reasoning.
const TOOL_ROW_LIMIT = 800;
const MAX_TOOL_ROUNDS = 6;
const MAX_TOKENS = 1024;

export class ExecutorError extends Error {}

type TranscriptEntry = Record<string, unknown>;

async function resolveExecutorModel(agent: { model: string | null }): Promise<ExecutorModel> {
  return (EXECUTOR_ALLOWED_MODELS as readonly string[]).includes(agent.model ?? "") ? (agent.model as ExecutorModel) : DEFAULT_EXECUTOR_MODEL;
}

async function createRunRow(supabase: SupabaseClient, agentId: string, category: string, model: string): Promise<string> {
  const { data, error } = await supabase
    .from("auevo_agent_runs")
    .insert({ agent_id: agentId, category, model, status: "running" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function finishRun(
  supabase: SupabaseClient,
  runId: string,
  patch: { status: "completed" | "failed"; transcript: TranscriptEntry[]; proofEventId?: string | null; error?: string | null }
): Promise<void> {
  await supabase
    .from("auevo_agent_runs")
    .update({
      status: patch.status,
      transcript: patch.transcript,
      ...(patch.proofEventId !== undefined ? { proof_event_id: patch.proofEventId } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
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
  const runId = await createRunRow(supabase, agentId, "skill", model);

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
    await finishRun(supabase, runId, { status: "failed", transcript, error: failureReason });
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
    await finishRun(supabase, runId, { status: "completed", transcript, proofEventId });
    return {
      runId,
      status: "completed",
      proofEventId,
      summary: `Guessed ${skillResult.guess}, actual was ${skillResult.actual} — ${skillResult.verdict}.`,
    };
  } catch (err) {
    const message = err instanceof SkillSubmitError ? err.message : err instanceof Error ? err.message : "Submission failed";
    await finishRun(supabase, runId, { status: "failed", transcript, error: message });
    return { runId, status: "failed", proofEventId: null, summary: message };
  }
}

function buildPredictionSystemPrompt(currentPrice: number, deadlineIso: string): string {
  return [
    "You are an AI agent attempting a verifiable AUEVO Prediction challenge: a single directional call on SPY (a tokenized S&P 500 tracker on Robinhood Chain), over a fixed 24-hour horizon.",
    `Current SPY price: $${currentPrice.toFixed(2)} USD, just read from a live price feed.`,
    `Your call resolves at ${deadlineIso} (UTC), 24 hours from now, against the real SPY price at that moment.`,
    "Call submit_direction with 'up' if you believe the price at the deadline will be at or above the current price, or 'down' if you believe it will be at or below. You get no other data — this is a direction call on the information you have right now, not a research task.",
  ].join(" ");
}

const SUBMIT_DIRECTION_TOOL: Anthropic.Tool = {
  name: "submit_direction",
  description: "Submit your final directional call for SPY over the next 24 hours.",
  input_schema: {
    type: "object",
    properties: {
      direction: { type: "string", enum: ["up", "down"], description: "'up' if SPY will be at or above the current price at the deadline, 'down' otherwise." },
      reasoning: { type: "string", description: "One or two sentences on your call." },
    },
    required: ["direction"],
  },
};

/**
 * Runs one Prediction attempt end to end for a hosted agent: a pure
 * directional call on SPY (the one asset the rest of this category's
 * manual flow already uses — src/app/proofs/spy.ts — so every attempt,
 * human-posted or executor-posted, is directly comparable), target price
 * fixed to the price at commit time so there's no trivial threshold to
 * game. Unlike Skill, this category settles later (the existing
 * verify-claims cron, against a real price at the deadline) — a
 * "completed" run here means the agent successfully committed a call,
 * not that it was right; the Proof Event itself stays "awaiting_settlement"
 * until the cron resolves it.
 */
export async function runPredictionChallenge(agentId: string): Promise<ExecutorRunOutcome> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new ExecutorError("Supabase is not configured on the server");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ExecutorError("The executor is not configured on the server (no ANTHROPIC_API_KEY)");

  const agent = await getAgentById(agentId);
  if (!agent || agent.retired_at) throw new ExecutorError("Unknown or retired agent");
  if (!agent.is_hosted) throw new ExecutorError("Only a hosted (\"Create an agent\") agent can be run by AUEVO's own executor");

  const prices = await fetchTokenPricesUsd(SPY_CHAIN_ID, [SPY_ADDRESS]);
  const currentPrice = prices.get(SPY_ADDRESS.toLowerCase());
  if (!currentPrice) throw new ExecutorError("No live SPY price available right now — try again later");

  const deadline = new Date(Date.now() + PREDICTION_FIXED_HORIZON_HOURS * 60 * 60 * 1000);
  const model = await resolveExecutorModel(agent);
  const runId = await createRunRow(supabase, agentId, "prediction", model);

  const transcript: TranscriptEntry[] = [];
  const anthropic = new Anthropic({ apiKey });
  const system = buildPredictionSystemPrompt(currentPrice, deadline.toISOString());
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: "Make your call now by calling submit_direction." },
  ];

  let finalDirection: "up" | "down" | null = null;
  let failureReason: string | null = null;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS && finalDirection === null; round++) {
      const response = await anthropic.messages.create({ model, max_tokens: MAX_TOKENS, system, tools: [SUBMIT_DIRECTION_TOOL], messages });
      transcript.push({ role: "assistant", content: response.content });
      messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (toolUses.length === 0) {
        failureReason = "Model returned no tool call";
        break;
      }
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        if (use.name === "submit_direction") {
          const input = use.input as { direction?: unknown };
          if (input.direction === "up" || input.direction === "down") finalDirection = input.direction;
          else failureReason = "submit_direction called with an invalid direction";
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: "Received." });
        } else {
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: "Unknown tool", is_error: true });
        }
      }
      transcript.push({ role: "user", content: toolResults });
      messages.push({ role: "user", content: toolResults });
    }
    if (finalDirection === null && !failureReason) failureReason = "Ran out of tool-call rounds without a final answer";
  } catch (err) {
    failureReason = err instanceof Error ? err.message : "Model call failed";
  }

  if (finalDirection === null) {
    await finishRun(supabase, runId, { status: "failed", transcript, error: failureReason });
    return { runId, status: "failed", proofEventId: null, summary: failureReason ?? "Run failed" };
  }

  try {
    const { proofEventId } = await submitClaimAttempt({
      supabase,
      agentId,
      topic: "prediction",
      body: `Called SPY ${finalDirection} over the next 24h from $${currentPrice.toFixed(2)}.`,
      asset: SPY_ADDRESS,
      chainId: SPY_CHAIN_ID,
      direction: finalDirection,
      targetPrice: currentPrice,
      deadline: deadline.toISOString(),
    });
    await finishRun(supabase, runId, { status: "completed", transcript, proofEventId });
    return {
      runId,
      status: "completed",
      proofEventId,
      summary: `Committed: SPY ${finalDirection} from $${currentPrice.toFixed(2)} by ${deadline.toISOString()} — settles automatically once the deadline passes.`,
    };
  } catch (err) {
    const message = err instanceof ClaimSubmitError ? err.message : err instanceof Error ? err.message : "Submission failed";
    await finishRun(supabase, runId, { status: "failed", transcript, error: message });
    return { runId, status: "failed", proofEventId: null, summary: message };
  }
}
