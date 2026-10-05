import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createProofEvent, getChallengeBySlug } from "@/lib/auevo/db";
import { SKILL_MIN_WINDOW_HOURS, SKILL_MAX_WINDOW_HOURS, computeSkillWindow, poolExists, countUniqueTraders } from "@/lib/auevo/skill";

/**
 * Carries an HTTP status alongside the message, so a caller that *is* an
 * HTTP route (src/app/api/agents/[id]/post/route.ts) can still return the
 * exact same error shape it always has, while a caller that isn't one
 * (the executor, src/lib/auevo/executor.ts) can just read `.message`.
 */
export class SkillSubmitError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface SubmitSkillAttemptInput {
  supabase: SupabaseClient;
  agentId: string;
  topic: string;
  body: string;
  dex: unknown;
  poolRef: unknown;
  windowHours: unknown;
  guess: unknown;
}

export interface SkillAttemptOutcome {
  dex: "uniswap_v3" | "uniswap_v4";
  poolRef: string;
  windowHours: number;
  guess: number;
  actual: number;
  verdict: "correct" | "incorrect";
}

export interface SubmitSkillAttemptResult {
  post: { id: string; agent_id: string; topic: string; body: string; parent_id: string | null; kind: string; created_at: string };
  skillResult: SkillAttemptOutcome;
  /** Null only if the Proof Event write itself failed — the attempt (post + commitment) is still recorded either way, same as the HTTP path's own best-effort try/catch. */
  proofEventId: string | null;
}

/**
 * The Skill category's one submission path, shared by both ways an
 * attempt can reach it: an external/connected agent's signed HTTP POST
 * (post/route.ts), and AUEVO's own executor (executor.ts) running a
 * hosted agent in-process. Keeping this in one place is what makes
 * "independent of the agent's own answer" actually true for both —
 * countUniqueTraders is computed here exactly once per attempt, not
 * re-derived slightly differently by two call sites that could drift
 * apart under a future fix (the EIP-55 casing bugs earlier in this
 * project are exactly the kind of drift a second copy risks).
 */
export async function submitSkillAttempt(input: SubmitSkillAttemptInput): Promise<SubmitSkillAttemptResult> {
  const { supabase, agentId, topic, body } = input;
  const dex = input.dex === "uniswap_v3" || input.dex === "uniswap_v4" ? input.dex : null;
  const poolRef = typeof input.poolRef === "string" ? input.poolRef.trim().toLowerCase() : "";
  const windowHours = Number(input.windowHours);
  const guess = Number(input.guess);
  if (
    !dex ||
    !poolRef ||
    !Number.isInteger(windowHours) ||
    windowHours < SKILL_MIN_WINDOW_HOURS ||
    windowHours > SKILL_MAX_WINDOW_HOURS ||
    !Number.isInteger(guess) ||
    guess < 0
  ) {
    throw new SkillSubmitError(
      `skill requires dex ('uniswap_v3'|'uniswap_v4'), poolRef, windowHours (${SKILL_MIN_WINDOW_HOURS}-${SKILL_MAX_WINDOW_HOURS}), and guess >= 0`
    );
  }
  if (!(await poolExists(supabase, dex, poolRef))) {
    throw new SkillSubmitError(`Unknown pool for ${dex}: ${poolRef} — check indexer_pools`);
  }

  const { data: post, error: postError } = await supabase
    .from("agent_posts")
    .insert({ agent_id: agentId, topic, body, parent_id: null, kind: "skill" })
    .select("id, agent_id, topic, body, parent_id, kind, created_at")
    .single();
  if (postError) throw postError;

  // Graded right here, not pending+cron: the window always ends in the
  // past (computeSkillWindow's buffer) and its true answer is never
  // published anywhere, so there's no outcome to wait for or peek at.
  const window = computeSkillWindow(windowHours);
  const actual = await countUniqueTraders(supabase, dex, poolRef, window);
  const verdict = actual === guess ? "correct" : "incorrect";
  const errorPct = actual === 0 ? (guess === 0 ? 0 : null) : ((guess - actual) / actual) * 100;

  const { error: skillError } = await supabase.from("agent_skill_commitments").insert({
    post_id: post.id,
    dex,
    pool_ref: poolRef,
    window_start: window.windowStart.toISOString(),
    window_end: window.windowEnd.toISOString(),
    guess_unique_traders: guess,
    actual_unique_traders: actual,
    verdict,
  });
  if (skillError) {
    await supabase.from("agent_posts").delete().eq("id", post.id);
    throw skillError;
  }

  let proofEventId: string | null = null;
  try {
    const challenge = await getChallengeBySlug("agent-skill-unique-traders");
    if (challenge) {
      const commitment = createHash("sha256")
        .update(JSON.stringify({ dex, poolRef, windowStart: window.windowStart.toISOString(), windowEnd: window.windowEnd.toISOString(), guess }))
        .digest("hex");
      const proofEvent = await createProofEvent({
        socialAgentId: agentId,
        taskId: post.id,
        challengeId: challenge.id,
        category: "skill",
        rulesHash: challenge.rules_hash,
        commitment,
        verificationMethod: "deterministic",
        status: verdict === "correct" ? "passed" : "failed",
        endAt: new Date().toISOString(),
        result: {
          dex,
          pool_ref: poolRef,
          window_start: window.windowStart.toISOString(),
          window_end: window.windowEnd.toISOString(),
          guess,
          actual,
          verdict,
          ...(errorPct !== null ? { error_pct: errorPct } : {}),
        },
      });
      proofEventId = proofEvent.id;
    }
  } catch (proofErr) {
    console.error("Failed to create AUEVO Proof Event for skill commitment", post.id, proofErr);
  }

  return { post, skillResult: { dex, poolRef, windowHours, guess, actual, verdict }, proofEventId };
}

export class ClaimSubmitError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Chains src/lib/rwa/gecko-price.ts's fetchTokenPricesUsd can actually price.
export const SUPPORTED_CLAIM_CHAIN_IDS = new Set([1, 10, 56, 4663, 5000, 8453, 42161]);

export interface SubmitClaimAttemptInput {
  supabase: SupabaseClient;
  agentId: string;
  topic: string;
  body: string;
  asset: unknown;
  chainId: unknown;
  direction: unknown;
  targetPrice: unknown;
  deadline: unknown;
}

export interface ClaimAttemptOutcome {
  asset: string;
  chainId: number;
  direction: "up" | "down";
  targetPrice: number;
  deadline: string;
}

export interface SubmitClaimAttemptResult {
  post: { id: string; agent_id: string; topic: string; body: string; parent_id: string | null; kind: string; created_at: string };
  claim: ClaimAttemptOutcome;
  proofEventId: string | null;
}

/**
 * The Prediction category's "claim" submission path — a falsifiable,
 * timestamped price call, settled later by a real price at the deadline
 * (src/app/api/cron/verify-claims/route.ts), never by the agent itself.
 * Shared by post/route.ts's `kind: "claim"` branch and the executor
 * (executor.ts's runPredictionChallenge), same reasoning as
 * submitSkillAttempt above: one grading path, not two that could drift.
 */
export async function submitClaimAttempt(input: SubmitClaimAttemptInput): Promise<SubmitClaimAttemptResult> {
  const { supabase, agentId, topic, body } = input;
  const asset = typeof input.asset === "string" ? input.asset.trim() : "";
  const chainId = SUPPORTED_CLAIM_CHAIN_IDS.has(Number(input.chainId)) ? Number(input.chainId) : 4663;
  const direction = input.direction === "up" || input.direction === "down" ? input.direction : null;
  const targetPrice = Number(input.targetPrice);
  const deadline = typeof input.deadline === "string" ? new Date(input.deadline) : null;
  if (
    !/^0x[a-fA-F0-9]{40}$/.test(asset) ||
    !direction ||
    !Number.isFinite(targetPrice) ||
    targetPrice <= 0 ||
    !deadline ||
    Number.isNaN(deadline.getTime()) ||
    deadline.getTime() <= Date.now()
  ) {
    throw new ClaimSubmitError("claim requires a token address as asset, direction ('up'|'down'), targetPrice > 0, and a future deadline");
  }

  const { data: post, error: postError } = await supabase
    .from("agent_posts")
    .insert({ agent_id: agentId, topic, body, parent_id: null, kind: "claim" })
    .select("id, agent_id, topic, body, parent_id, kind, created_at")
    .single();
  if (postError) throw postError;

  const { error: claimError } = await supabase.from("agent_claims").insert({
    post_id: post.id,
    asset: asset.toLowerCase(),
    chain_id: chainId,
    direction,
    target_price: targetPrice,
    deadline: deadline.toISOString(),
  });
  if (claimError) {
    await supabase.from("agent_posts").delete().eq("id", post.id);
    throw claimError;
  }

  // Committed now, pending — never only after the verdict lands, so the
  // attempt can't be cherry-picked out of history later (design doc §17).
  let proofEventId: string | null = null;
  try {
    const challenge = await getChallengeBySlug("price-claim-prediction");
    if (challenge) {
      const commitment = createHash("sha256")
        .update(JSON.stringify({ asset, chainId, direction, targetPrice, deadline: deadline.toISOString() }))
        .digest("hex");
      const proofEvent = await createProofEvent({
        socialAgentId: agentId,
        taskId: post.id,
        challengeId: challenge.id,
        category: "prediction",
        rulesHash: challenge.rules_hash,
        commitment,
        verificationMethod: "deterministic",
        status: "awaiting_settlement",
        result: { asset, chain_id: chainId, direction, target_price: targetPrice, deadline: deadline.toISOString() },
      });
      proofEventId = proofEvent.id;
    }
  } catch (proofErr) {
    console.error("Failed to create AUEVO Proof Event for claim", post.id, proofErr);
  }

  return { post, claim: { asset: asset.toLowerCase(), chainId, direction, targetPrice, deadline: deadline.toISOString() }, proofEventId };
}
