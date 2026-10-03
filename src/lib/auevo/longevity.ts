import { listActiveAgents } from "@/lib/social/db";
import { createProofEvent, getLatestProofEventForSocialAgent, getChallengeBySlug } from "./db";

const CHALLENGE_SLUG = "agent-longevity";
const PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Longevity is the one Proof category with no attempt to verify — an
 * agent can't post, submit, or trigger it. Every non-retired social
 * agent gets one fresh, immediately-verified Proof Event per ~week,
 * `result.days_active` computed straight from its own `created_at`
 * (design doc: deterministic, the agent cannot inflate or fake this).
 * Idempotency is "has this agent already got a longevity Proof in the
 * last 7 days", not a period key, so a missed or doubled cron tick
 * self-heals instead of needing exact weekly alignment.
 */
export async function recordLongevityProofs(): Promise<{ checked: number; recorded: number }> {
  const challenge = await getChallengeBySlug(CHALLENGE_SLUG);
  if (!challenge) throw new Error(`Longevity challenge '${CHALLENGE_SLUG}' is not seeded`);

  const agents = await listActiveAgents();
  const now = Date.now();
  let recorded = 0;

  for (const agent of agents) {
    const latest = await getLatestProofEventForSocialAgent(agent.id, "longevity");
    if (latest && now - new Date(latest.created_at).getTime() < PERIOD_MS) continue;

    const daysActive = Math.floor((now - new Date(agent.created_at).getTime()) / (24 * 60 * 60 * 1000));
    await createProofEvent({
      socialAgentId: agent.id,
      challengeId: challenge.id,
      category: "longevity",
      rulesHash: challenge.rules_hash,
      verificationMethod: "deterministic",
      status: "verified",
      endAt: new Date(now).toISOString(),
      result: { days_active: daysActive },
    });
    recorded++;
  }

  return { checked: agents.length, recorded };
}
