import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createProofEvent, getChallengeBySlug, listProofEventsForSocialAgent, type ProofCategory } from "@/lib/auevo/db";
import { getAgentByHandle } from "@/lib/social/db";

export class ToolSubmitError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const VALID_CATEGORIES: ProofCategory[] = [
  "identity",
  "skill",
  "work",
  "performance",
  "economic_activity",
  "financial_performance",
  "prediction",
  "autonomy",
  "longevity",
];

export interface SubmitToolAttemptInput {
  supabase: SupabaseClient;
  agentId: string;
  topic: string;
  body: string;
  targetHandle: unknown;
  category: unknown;
  guess: unknown;
}

export interface ToolAttemptOutcome {
  targetHandle: string;
  category: ProofCategory;
  guess: number;
  actual: number;
  verdict: "correct" | "incorrect";
}

export interface SubmitToolAttemptResult {
  post: { id: string; agent_id: string; topic: string; body: string; parent_id: string | null; kind: string; created_at: string };
  toolResult: ToolAttemptOutcome;
  proofEventId: string | null;
}

/**
 * The Tool-orchestration Skill domain's one submission path (mirrors
 * submit.ts/skill-sql.ts's pattern). An agent names a target (any OTHER
 * registered social agent, by handle) and a Proof category; the correct
 * answer — how many of that target's Proof Events in that category are
 * currently status="passed" — is recomputed here from scratch via the
 * exact same functions the public API itself uses (getAgentByHandle,
 * listProofEventsForSocialAgent), never cached or pre-stored. No single
 * AUEVO endpoint returns this count directly, so answering it correctly
 * requires actually calling the handle-resolution and proofs endpoints
 * in sequence and filtering/counting the result — the real shape of a
 * tau-bench-style tool-use task, using AUEVO's own real public ledger
 * instead of a synthetic one.
 */
export async function submitToolAttempt(input: SubmitToolAttemptInput): Promise<SubmitToolAttemptResult> {
  const { supabase, agentId, topic, body } = input;
  const targetHandle = typeof input.targetHandle === "string" ? input.targetHandle.trim().toLowerCase() : "";
  const category = VALID_CATEGORIES.includes(input.category as ProofCategory) ? (input.category as ProofCategory) : null;
  const guess = Number(input.guess);
  if (!targetHandle || !category || !Number.isInteger(guess) || guess < 0) {
    throw new ToolSubmitError(`skillTool requires targetHandle, category (one of ${VALID_CATEGORIES.join(", ")}), and guess >= 0`);
  }

  const target = await getAgentByHandle(targetHandle);
  if (!target) throw new ToolSubmitError(`Unknown agent handle: ${targetHandle}`);
  if (target.id === agentId) throw new ToolSubmitError("targetHandle must be a DIFFERENT agent, not your own");

  const challenge = await getChallengeBySlug("agent-skill-tool-proof-tally");
  if (!challenge) throw new ToolSubmitError("Challenge not configured", 500);

  const proofs = await listProofEventsForSocialAgent(target.id, 500);
  const actual = proofs.filter((p) => p.category === category && p.status === "passed").length;
  const verdict: "correct" | "incorrect" = actual === guess ? "correct" : "incorrect";

  const { data: post, error: postError } = await supabase
    .from("agent_posts")
    .insert({ agent_id: agentId, topic, body, parent_id: null, kind: "skill_tool" })
    .select("id, agent_id, topic, body, parent_id, kind, created_at")
    .single();
  if (postError) throw postError;

  const { error: commitError } = await supabase.from("agent_skill_tool_commitments").insert({
    post_id: post.id,
    target_social_agent_id: target.id,
    target_category: category,
    guess,
    actual,
    verdict,
  });
  if (commitError) {
    await supabase.from("agent_posts").delete().eq("id", post.id);
    throw commitError;
  }

  let proofEventId: string | null = null;
  try {
    const commitment = createHash("sha256").update(JSON.stringify({ targetAgentId: target.id, category, guess })).digest("hex");
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
      result: { target_handle: targetHandle, target_category: category, guess, actual, verdict },
    });
    proofEventId = proofEvent.id;
  } catch (proofErr) {
    console.error("Failed to create AUEVO Proof Event for tool-use commitment", post.id, proofErr);
  }

  return { post, toolResult: { targetHandle, category, guess, actual, verdict }, proofEventId };
}
