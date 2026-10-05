import { listActiveAgents } from "@/lib/social/db";
import { createProofEvent, getLatestProofEventForSocialAgent, getChallengeBySlug, listProofEventsForSocialAgent, SETTLED_STATUSES } from "./db";

const CHALLENGE_SLUG = "agent-performance-success-rate";
const PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
const SOURCE_CATEGORIES = new Set(["skill", "work"]);
const SUCCESS_VERDICTS = new Set(["correct", "merged"]);

/**
 * Performance is passive like Longevity/Economic Activity — no new
 * attempt from the agent — but unlike them it doesn't read an external
 * source at all: it recomputes over Proof Events the agent already
 * earned under skill/work, the same way CategoryAggregate already does
 * for a single category. Periods are back-to-back (next period starts
 * where the last one's `period_end` left off), same self-healing
 * property as Economic Activity.
 */
export async function recordPerformanceProofs(): Promise<{ checked: number; recorded: number }> {
  const challenge = await getChallengeBySlug(CHALLENGE_SLUG);
  if (!challenge) throw new Error(`Performance challenge '${CHALLENGE_SLUG}' is not seeded`);

  const agents = await listActiveAgents();
  const now = Date.now();
  let recorded = 0;

  for (const agent of agents) {
    const latest = await getLatestProofEventForSocialAgent(agent.id, "performance");
    const priorPeriodEnd = typeof latest?.result?.period_end === "string" ? latest.result.period_end : null;
    const periodStartMs = priorPeriodEnd ? new Date(priorPeriodEnd).getTime() : new Date(agent.created_at).getTime();
    if (now - periodStartMs < PERIOD_MS) continue;

    const periodStartIso = new Date(periodStartMs).toISOString();
    const nowIso = new Date(now).toISOString();

    const proofs = await listProofEventsForSocialAgent(agent.id, 500);
    const inPeriod = proofs.filter(
      (p) =>
        SOURCE_CATEGORIES.has(p.category) &&
        (SETTLED_STATUSES as string[]).includes(p.status) &&
        new Date(p.created_at).getTime() >= periodStartMs &&
        new Date(p.created_at).getTime() < now
    );
    const attempted = inPeriod.length;
    const succeeded = inPeriod.filter((p) => SUCCESS_VERDICTS.has(p.result?.verdict as string)).length;
    const successRate = attempted > 0 ? (succeeded / attempted) * 100 : null;

    await createProofEvent({
      socialAgentId: agent.id,
      challengeId: challenge.id,
      category: "performance",
      rulesHash: challenge.rules_hash,
      verificationMethod: "deterministic",
      status: "passed",
      endAt: nowIso,
      result: {
        attempted,
        succeeded,
        ...(successRate !== null ? { success_rate: successRate } : {}),
        period_start: periodStartIso,
        period_end: nowIso,
      },
    });
    recorded++;
  }

  return { checked: agents.length, recorded };
}
