import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase";
import { getAgentById } from "@/lib/social/db";
import { listSuggestedSkillPools, computeSkillWindow, type SuggestedSkillPool } from "@/lib/auevo/skill";
import { submitSkillAttempt, SkillSubmitError, submitClaimAttempt, ClaimSubmitError } from "@/lib/auevo/submit";
import { submitVirtualPortfolioAttempt, VirtualPortfolioSubmitError, VIRTUAL_PORTFOLIO_STARTING_BALANCE_USD, VIRTUAL_PORTFOLIO_FEE_BPS, VIRTUAL_PORTFOLIO_HORIZON_HOURS } from "@/lib/auevo/virtual-portfolio";
import { EXECUTOR_ALLOWED_MODELS, type ExecutorModel } from "@/lib/auevo/executor-models";
import { getHostedAgentOrbioKey } from "@/lib/auevo/hosted-agent";
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

// Orbio (orbio.so) exposes an Anthropic-SDK-compatible endpoint at this
// base URL — per their own "migration" docs, only the base URL and key
// change; model names, streaming and tool calls work unchanged through
// the same @anthropic-ai/sdk client this file already uses. Letting an
// agent owner supply their own Orbio key here (migration 0035) is what
// lifts both the two-model allowlist AND AUEVO's own per-run cost —
// from that point on the run is on the owner's Orbio account, not ours.
const ORBIO_BASE_URL = "https://api.orbio.so/api/v1";

const SKILL_FIXED_WINDOW_HOURS = 24; // Same horizon for every agent's run — "одинаковые условия для сравниваемых агентов" (doc §4f).
const PREDICTION_FIXED_HORIZON_HOURS = 24; // Same horizon for every agent's run, same reasoning.
const TOOL_ROW_LIMIT = 800;
const MAX_TOOL_ROUNDS = 6;
const MAX_TOKENS = 1024;

export class ExecutorError extends Error {}

type TranscriptEntry = Record<string, unknown>;

/**
 * Picks the Anthropic client AND the model string together, since which
 * client is valid depends on which model is being trusted. No Orbio key
 * on file (the common case): AUEVO's own ANTHROPIC_API_KEY, restricted
 * to EXECUTOR_ALLOWED_MODELS — exactly the previous behavior, unchanged.
 * An Orbio key on file: that key against ORBIO_BASE_URL, and agent.model
 * is trusted as-is (any model Orbio offers) — it's the owner's account
 * and cost from here on, so AUEVO has no reason to restrict their choice.
 */
async function resolveExecutorClient(
  supabase: SupabaseClient,
  agent: { id: string; model: string | null }
): Promise<{ anthropic: Anthropic; model: string }> {
  const orbioKey = await getHostedAgentOrbioKey(supabase, agent.id);
  if (orbioKey) {
    const model = agent.model?.trim() || DEFAULT_EXECUTOR_MODEL;
    return { anthropic: new Anthropic({ apiKey: orbioKey, baseURL: ORBIO_BASE_URL }), model };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ExecutorError("The executor is not configured on the server (no ANTHROPIC_API_KEY)");
  const model = (EXECUTOR_ALLOWED_MODELS as readonly string[]).includes(agent.model ?? "") ? (agent.model as ExecutorModel) : DEFAULT_EXECUTOR_MODEL;
  return { anthropic: new Anthropic({ apiKey }), model };
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
  /** Kept for the executor run log / API consumers that just want one line — the UI itself renders task/answer/verdict separately, in plain language. */
  summary: string;
  /** Plain-language restatement of what the agent was actually asked — not jargon, so a non-technical visitor understands the challenge without reading the description card again. */
  task: string;
  /** Plain-language restatement of what the agent decided. */
  answer: string;
  /** "correct"/"incorrect" when known immediately (Skill); "pending" when it only settles later (Prediction, Financial). */
  verdict: "correct" | "incorrect" | "pending";
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

  const agent = await getAgentById(agentId);
  if (!agent || agent.retired_at) throw new ExecutorError("Unknown or retired agent");
  if (!agent.is_hosted) throw new ExecutorError("Only a hosted (\"Create an agent\") agent can be run by AUEVO's own executor");

  const pools = await listSuggestedSkillPools(supabase);
  const candidate = pools.find((p) => p.activity !== "light") ?? pools[0];
  if (!candidate) throw new ExecutorError("No active pool is available for a Skill run right now — try again later");

  const windowHours = SKILL_FIXED_WINDOW_HOURS;
  const window = computeSkillWindow(windowHours);
  const { anthropic, model } = await resolveExecutorClient(supabase, agent);
  const runId = await createRunRow(supabase, agentId, "skill", model);

  const transcript: TranscriptEntry[] = [];
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

  const taskDescription = `Count how many different wallets traded ${candidate.pairLabel ?? "this pool"} in the last ${windowHours} hours — the real figure is never published, so the agent has to actually work it out from the raw on-chain data.`;

  if (finalGuess === null) {
    await finishRun(supabase, runId, { status: "failed", transcript, error: failureReason });
    return { runId, status: "failed", proofEventId: null, summary: failureReason ?? "Run failed", task: taskDescription, answer: "", verdict: "pending" };
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
      task: taskDescription,
      answer: `${skillResult.guess} wallet${skillResult.guess === 1 ? "" : "s"} (the real answer was ${skillResult.actual})`,
      verdict: skillResult.verdict === "correct" ? "correct" : "incorrect",
    };
  } catch (err) {
    const message = err instanceof SkillSubmitError ? err.message : err instanceof Error ? err.message : "Submission failed";
    await finishRun(supabase, runId, { status: "failed", transcript, error: message });
    return { runId, status: "failed", proofEventId: null, summary: message, task: taskDescription, answer: "", verdict: "pending" };
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

  const agent = await getAgentById(agentId);
  if (!agent || agent.retired_at) throw new ExecutorError("Unknown or retired agent");
  if (!agent.is_hosted) throw new ExecutorError("Only a hosted (\"Create an agent\") agent can be run by AUEVO's own executor");

  const prices = await fetchTokenPricesUsd(SPY_CHAIN_ID, [SPY_ADDRESS]);
  const currentPrice = prices.get(SPY_ADDRESS.toLowerCase());
  if (!currentPrice) throw new ExecutorError("No live SPY price available right now — try again later");

  const deadline = new Date(Date.now() + PREDICTION_FIXED_HORIZON_HOURS * 60 * 60 * 1000);
  const { anthropic, model } = await resolveExecutorClient(supabase, agent);
  const runId = await createRunRow(supabase, agentId, "prediction", model);

  const transcript: TranscriptEntry[] = [];
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

  const taskDescription = `Call whether SPY (an S&P 500 tracker) will be worth more or less than today's price ($${currentPrice.toFixed(2)}) 24 hours from now.`;

  if (finalDirection === null) {
    await finishRun(supabase, runId, { status: "failed", transcript, error: failureReason });
    return { runId, status: "failed", proofEventId: null, summary: failureReason ?? "Run failed", task: taskDescription, answer: "", verdict: "pending" };
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
      task: taskDescription,
      answer: `${finalDirection === "up" ? "Will go up" : "Will go down"} (called from $${currentPrice.toFixed(2)})`,
      verdict: "pending",
    };
  } catch (err) {
    const message = err instanceof ClaimSubmitError ? err.message : err instanceof Error ? err.message : "Submission failed";
    await finishRun(supabase, runId, { status: "failed", transcript, error: message });
    return { runId, status: "failed", proofEventId: null, summary: message, task: taskDescription, answer: "", verdict: "pending" };
  }
}

function buildFinancialSystemPrompt(currentPrice: number, closesAtIso: string): string {
  return [
    "You are an AI agent attempting a verifiable AUEVO Financial challenge: a ONE-TIME allocation decision for a SIMULATED portfolio. This is a simulation only — no real money, wallet, or on-chain transaction is involved.",
    `Starting simulated capital: $${VIRTUAL_PORTFOLIO_STARTING_BALANCE_USD.toLocaleString()}. The one asset available: SPY, currently $${currentPrice.toFixed(2)} USD.`,
    `You choose what percentage of the capital to allocate to SPY (0-100%; the rest stays simulated cash). This single allocation is locked at today's price and settles ${VIRTUAL_PORTFOLIO_HORIZON_HOURS}h from now (${closesAtIso}, UTC) against the real price then, net of a fixed ${VIRTUAL_PORTFOLIO_FEE_BPS / 100}% simulated fee on both the entry and exit trade.`,
    "You are graded against a 100%-allocated (fully invested, buy-and-hold) benchmark over the exact same window and fee model — you only beat it by correctly judging whether to hold MORE or LESS than full exposure. Call submit_allocation with your final percentage.",
  ].join(" ");
}

const SUBMIT_ALLOCATION_TOOL: Anthropic.Tool = {
  name: "submit_allocation",
  description: "Submit your final allocation percentage into SPY for this simulated portfolio.",
  input_schema: {
    type: "object",
    properties: {
      allocationPct: { type: "number", description: "0-100: percent of simulated capital to allocate to SPY.", minimum: 0, maximum: 100 },
      reasoning: { type: "string", description: "One or two sentences on your allocation choice." },
    },
    required: ["allocationPct"],
  },
};

/**
 * Runs one Financial attempt end to end for a hosted agent: a single
 * allocation decision on AUEVO's virtual portfolio (virtual-portfolio.ts)
 * — the first release's stand-in for the real, on-chain Financial Agent
 * League, which needs capital and identity a hosted agent doesn't have.
 * Like Prediction, "completed" here means the allocation was committed,
 * not that it will win — the Proof Event settles later via the
 * settle-virtual-portfolios cron.
 */
export async function runFinancialChallenge(agentId: string): Promise<ExecutorRunOutcome> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new ExecutorError("Supabase is not configured on the server");

  const agent = await getAgentById(agentId);
  if (!agent || agent.retired_at) throw new ExecutorError("Unknown or retired agent");
  if (!agent.is_hosted) throw new ExecutorError("Only a hosted (\"Create an agent\") agent can be run by AUEVO's own executor");

  const prices = await fetchTokenPricesUsd(SPY_CHAIN_ID, [SPY_ADDRESS]);
  const currentPrice = prices.get(SPY_ADDRESS.toLowerCase());
  if (!currentPrice) throw new ExecutorError("No live SPY price available right now — try again later");

  const closesAt = new Date(Date.now() + VIRTUAL_PORTFOLIO_HORIZON_HOURS * 60 * 60 * 1000);
  const { anthropic, model } = await resolveExecutorClient(supabase, agent);
  const runId = await createRunRow(supabase, agentId, "financial_performance", model);

  const transcript: TranscriptEntry[] = [];
  const system = buildFinancialSystemPrompt(currentPrice, closesAt.toISOString());
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: "Make your allocation decision now by calling submit_allocation." },
  ];

  let finalAllocation: number | null = null;
  let failureReason: string | null = null;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS && finalAllocation === null; round++) {
      const response = await anthropic.messages.create({ model, max_tokens: MAX_TOKENS, system, tools: [SUBMIT_ALLOCATION_TOOL], messages });
      transcript.push({ role: "assistant", content: response.content });
      messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (toolUses.length === 0) {
        failureReason = "Model returned no tool call";
        break;
      }
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        if (use.name === "submit_allocation") {
          const input = use.input as { allocationPct?: unknown };
          const pct = Number(input.allocationPct);
          if (Number.isFinite(pct) && pct >= 0 && pct <= 100) finalAllocation = pct;
          else failureReason = "submit_allocation called with an invalid percentage";
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: "Received." });
        } else {
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: "Unknown tool", is_error: true });
        }
      }
      transcript.push({ role: "user", content: toolResults });
      messages.push({ role: "user", content: toolResults });
    }
    if (finalAllocation === null && !failureReason) failureReason = "Ran out of tool-call rounds without a final answer";
  } catch (err) {
    failureReason = err instanceof Error ? err.message : "Model call failed";
  }

  const taskDescription = `Decide how much of a pretend $${VIRTUAL_PORTFOLIO_STARTING_BALANCE_USD.toLocaleString()} (no real money) to put into SPY vs keep as cash, one time — graded 24h later against just holding 100% the whole time.`;

  if (finalAllocation === null) {
    await finishRun(supabase, runId, { status: "failed", transcript, error: failureReason });
    return { runId, status: "failed", proofEventId: null, summary: failureReason ?? "Run failed", task: taskDescription, answer: "", verdict: "pending" };
  }

  try {
    const { attempt, proofEventId } = await submitVirtualPortfolioAttempt({
      supabase,
      agentId,
      topic: "financial",
      body: `Allocated ${finalAllocation}% of a $${VIRTUAL_PORTFOLIO_STARTING_BALANCE_USD.toLocaleString()} simulated portfolio to SPY at $${currentPrice.toFixed(2)}.`,
      allocationPct: finalAllocation,
    });
    await finishRun(supabase, runId, { status: "completed", transcript, proofEventId });
    return {
      runId,
      status: "completed",
      proofEventId,
      summary: `Committed (simulation): ${attempt.allocationPct}% allocated to SPY at $${currentPrice.toFixed(2)} — settles automatically in ${VIRTUAL_PORTFOLIO_HORIZON_HOURS}h.`,
      task: taskDescription,
      answer: `${attempt.allocationPct}% into SPY, ${100 - attempt.allocationPct}% kept as cash`,
      verdict: "pending",
    };
  } catch (err) {
    const message = err instanceof VirtualPortfolioSubmitError ? err.message : err instanceof Error ? err.message : "Submission failed";
    await finishRun(supabase, runId, { status: "failed", transcript, error: message });
    return { runId, status: "failed", proofEventId: null, summary: message, task: taskDescription, answer: "", verdict: "pending" };
  }
}
