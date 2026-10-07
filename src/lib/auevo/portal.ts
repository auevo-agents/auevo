import { unstable_cache } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase";
import { aggregateCategory, CATEGORY_RESULT_FIELD, type CategoryAggregate } from "@/lib/auevo/score";
import { UNSETTLED_STATUSES, type ProofCategory, type ProofEvent } from "@/lib/auevo/db";
import type { SocialAgent } from "@/lib/social/db";

// This app's own Next.js build runs under Cache Components' "previous
// model" (see node_modules/next/dist/docs/01-app/02-guides/
// caching-without-cache-components.md) — unlike legacy Next, a plain
// `fetch`/Supabase call with no explicit cache option is NEVER cached,
// so every page's own `export const revalidate = 15` was a no-op for
// these functions: each request re-ran its Supabase round-trip live. The
// unstable_cache wrapper below is what actually makes that 15s number
// real — confirmed via `x-vercel-cache: MISS` + `cache-control: private,
// no-store` on every single repeated request before this was added.
const PORTAL_REVALIDATE_SECONDS = 15;

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

/**
 * Every caller here only ever reads id/category/status/verification_method/
 * result/created_at (and social_agent_id, to bucket rows back to an
 * agent) off the returned proofs — aggregateCategory() and the forest/
 * card views never touch the rest. The full-width columns (evidence_*,
 * validator_signatures, commitment hashes, …) are what made this query's
 * payload balloon once it's joined across up to 200 agents at once; the
 * single-agent Passport page's own getPortalRecordByHandle still selects
 * everything, since its "Raw Proof Events" panel deliberately dumps the
 * full row.
 */
const LIST_PROOF_COLUMNS = "id, social_agent_id, category, status, verification_method, result, created_at";

async function fetchAgentPortalRecords(limit: number, includeTest: boolean): Promise<AgentPortalRecord[]> {
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
    .select(LIST_PROOF_COLUMNS)
    .in("social_agent_id", ids)
    .order("created_at", { ascending: false });

  if (proofsError) return (agents as SocialAgent[]).map((agent) => buildRecord(agent, []));
  const proofRows = (proofs ?? []) as ProofEvent[];

  return (agents as SocialAgent[])
    .map((agent) => buildRecord(agent, proofRows.filter((p) => p.social_agent_id === agent.id)))
    .sort((a, b) => b.verified - a.verified || b.attempted - a.attempted || b.ageDays - a.ageDays);
}

const cachedAgentPortalRecords = unstable_cache(fetchAgentPortalRecords, ["agent-portal-records"], { revalidate: PORTAL_REVALIDATE_SECONDS });

export async function listAgentPortalRecords(limit = 24, { includeTest = false }: { includeTest?: boolean } = {}): Promise<AgentPortalRecord[]> {
  return cachedAgentPortalRecords(limit, includeTest);
}

async function fetchPortalRecordByHandle(handle: string): Promise<AgentPortalRecord | null> {
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

const cachedPortalRecordByHandle = unstable_cache(fetchPortalRecordByHandle, ["agent-portal-record-by-handle"], { revalidate: PORTAL_REVALIDATE_SECONDS });

export async function getPortalRecordByHandle(handle: string): Promise<AgentPortalRecord | null> {
  return cachedPortalRecordByHandle(handle.toLowerCase());
}
