import { getSupabaseServer } from "@/lib/supabase";
import { aggregateCategory, CATEGORY_RESULT_FIELD, type CategoryAggregate } from "@/lib/auevo/score";
import { UNSETTLED_STATUSES, type ProofCategory, type ProofEvent } from "@/lib/auevo/db";
import type { SocialAgent } from "@/lib/social/db";

export const PORTAL_CATEGORIES: ProofCategory[] = [
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

export interface AgentPortalRecord {
  agent: SocialAgent;
  proofs: ProofEvent[];
  categories: CategoryAggregate[];
  attempted: number;
  verified: number;
  pending: number;
  rejected: number;
  ageDays: number;
  dominantCategory: ProofCategory | null;
}

function ageDays(createdAt: string) {
  return Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000));
}

function buildRecord(agent: SocialAgent, proofs: ProofEvent[]): AgentPortalRecord {
  const categories = PORTAL_CATEGORIES
    .map((category) => aggregateCategory(proofs, category, CATEGORY_RESULT_FIELD[category] ?? null))
    .filter((c) => c.attempted > 0);
  const attempted = proofs.length;
  // These three buckets predate the 7-value ProofStatus enum and keep
  // their old names/shape (consumed across the Passport and the 3D
  // tree), but now map onto it precisely instead of folding a failed
  // outcome into "verified" the way the old flat status did — see
  // execution-plan doc §5.
  const verified = proofs.filter((p) => p.status === "passed").length;
  const pending = proofs.filter((p) => UNSETTLED_STATUSES.includes(p.status)).length;
  const rejected = proofs.filter((p) => p.status === "failed" || p.status === "inconclusive" || p.status === "cancelled").length;
  const dominant = [...categories].sort((a, b) => b.attempted - a.attempted)[0];

  return {
    agent,
    proofs,
    categories,
    attempted,
    verified,
    pending,
    rejected,
    ageDays: ageDays(agent.created_at),
    dominantCategory: (dominant?.category as ProofCategory | undefined) ?? null,
  };
}

export async function listAgentPortalRecords(limit = 24, { includeTest = false }: { includeTest?: boolean } = {}): Promise<AgentPortalRecord[]> {
  const supabase = getSupabaseServer();
  if (!supabase) return [];

  let query = supabase
    .from("social_agents")
    .select("id, handle, controller_address, bio, model, topics, avatar_url, created_at, retired_at, is_hosted, credit_agent_id, entity_kind")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!includeTest) query = query.eq("is_test", false);
  const { data: agents, error: agentsError } = await query;
  if (agentsError || !agents?.length) return [];

  const ids = agents.map((a) => a.id);
  const { data: proofs, error: proofsError } = await supabase
    .from("auevo_proof_events")
    .select(
      "id, agent_id, social_agent_id, task_id, challenge_id, category, rules_hash, commitment, start_at, end_at, input_commitment, output_hash, evidence_uri, evidence_hash, verification_method, validator_set, result, validator_signatures, human_intervention, status, created_at"
    )
    .in("social_agent_id", ids)
    .order("created_at", { ascending: false });

  if (proofsError) return (agents as SocialAgent[]).map((agent) => buildRecord(agent, []));
  const proofRows = (proofs ?? []) as ProofEvent[];

  return (agents as SocialAgent[])
    .map((agent) => buildRecord(agent, proofRows.filter((p) => p.social_agent_id === agent.id)))
    .sort((a, b) => b.verified - a.verified || b.attempted - a.attempted || b.ageDays - a.ageDays);
}

export async function getPortalRecordByHandle(handle: string): Promise<AgentPortalRecord | null> {
  const supabase = getSupabaseServer();
  if (!supabase) return null;
  const { data: agent, error } = await supabase
    .from("social_agents")
    .select("id, handle, controller_address, bio, model, topics, avatar_url, created_at, retired_at, is_hosted, credit_agent_id, entity_kind")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();
  if (error || !agent) return null;

  const { data: proofs } = await supabase
    .from("auevo_proof_events")
    .select(
      "id, agent_id, social_agent_id, task_id, challenge_id, category, rules_hash, commitment, start_at, end_at, input_commitment, output_hash, evidence_uri, evidence_hash, verification_method, validator_set, result, validator_signatures, human_intervention, status, created_at"
    )
    .eq("social_agent_id", agent.id)
    .order("created_at", { ascending: false })
    .limit(250);

  return buildRecord(agent as SocialAgent, (proofs ?? []) as ProofEvent[]);
}
