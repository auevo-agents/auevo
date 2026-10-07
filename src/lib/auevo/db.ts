import { getSupabaseServer } from "@/lib/supabase";

export type ProofCategory =
  | "identity"
  | "skill"
  | "work"
  | "performance"
  | "economic_activity"
  | "financial_performance"
  | "prediction"
  | "autonomy"
  | "longevity";

export type VerificationMethod = "deterministic" | "multi_validator" | "oracle" | "self_reported";
export type ProofStatus = "scheduled" | "running" | "awaiting_settlement" | "passed" | "failed" | "inconclusive" | "cancelled";
/** Not yet settled — the agent/AUEVO has nothing more to add until a cron or oracle resolves it. */
export const UNSETTLED_STATUSES: ProofStatus[] = ["scheduled", "running", "awaiting_settlement"];
/** Resolved, either way — a terminal outcome exists (unlike "inconclusive", where the settlement source itself was unavailable). */
export const SETTLED_STATUSES: ProofStatus[] = ["passed", "failed"];

export interface ProofEvent {
  id: string;
  agent_id: string | null; // bigint comes back as string from postgres — an on-chain AgentIdentity tokenId
  social_agent_id: string | null; // social_agents.id — exactly one of agent_id/social_agent_id is ever set
  task_id: string | null;
  challenge_id: string | null;
  category: ProofCategory;
  rules_hash: string;
  commitment: string | null;
  start_at: string;
  end_at: string | null;
  input_commitment: string | null;
  output_hash: string | null;
  evidence_uri: string | null;
  evidence_hash: string | null;
  verification_method: VerificationMethod;
  validator_set: unknown[];
  result: Record<string, unknown>;
  validator_signatures: unknown[];
  human_intervention: Record<string, unknown> | null;
  status: ProofStatus;
  created_at: string;
}

const PROOF_COLUMNS =
  "id, agent_id, social_agent_id, task_id, challenge_id, category, rules_hash, commitment, start_at, end_at, input_commitment, output_hash, evidence_uri, evidence_hash, verification_method, validator_set, result, validator_signatures, human_intervention, status, created_at";

function db() {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");
  return supabase;
}

/** False on a replayed nonce (primary-key conflict), so callers turn it into a 401. */
export async function insertProofNonce(agentId: string, nonce: string): Promise<boolean> {
  const { error } = await db().from("auevo_proof_nonces").insert({ agent_id: agentId, nonce });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

export interface CreateProofEventInput {
  /** Exactly one of agentId (on-chain AgentIdentity tokenId) / socialAgentId (social_agents.id) must be set. */
  agentId?: string | null;
  socialAgentId?: string | null;
  taskId?: string | null;
  challengeId?: string | null;
  category: ProofCategory;
  rulesHash: string;
  commitment?: string | null;
  endAt?: string | null;
  inputCommitment?: string | null;
  outputHash?: string | null;
  evidenceURI?: string | null;
  evidenceHash?: string | null;
  verificationMethod: VerificationMethod;
  validatorSet?: unknown[];
  result?: Record<string, unknown>;
  validatorSignatures?: unknown[];
  humanIntervention?: Record<string, unknown> | null;
  status?: ProofStatus;
}

/**
 * Writes a Proof Event. Called the moment an agent commits to an attempt
 * (status defaults 'scheduled') — never only after a successful outcome —
 * so attempt history can't be cherry-picked (design doc §17).
 */
export async function createProofEvent(input: CreateProofEventInput): Promise<ProofEvent> {
  const agentId = input.agentId ?? null;
  const socialAgentId = input.socialAgentId ?? null;
  if (Boolean(agentId) === Boolean(socialAgentId)) {
    throw new Error("createProofEvent requires exactly one of agentId / socialAgentId");
  }

  const { data, error } = await db()
    .from("auevo_proof_events")
    .insert({
      agent_id: agentId,
      social_agent_id: socialAgentId,
      task_id: input.taskId ?? null,
      challenge_id: input.challengeId ?? null,
      category: input.category,
      rules_hash: input.rulesHash,
      commitment: input.commitment ?? null,
      end_at: input.endAt ?? null,
      input_commitment: input.inputCommitment ?? null,
      output_hash: input.outputHash ?? null,
      evidence_uri: input.evidenceURI ?? null,
      evidence_hash: input.evidenceHash ?? null,
      verification_method: input.verificationMethod,
      validator_set: input.validatorSet ?? [],
      result: input.result ?? {},
      validator_signatures: input.validatorSignatures ?? [],
      human_intervention: input.humanIntervention ?? null,
      status: input.status ?? "scheduled",
    })
    .select(PROOF_COLUMNS)
    .single();
  if (error) throw error;
  return data as ProofEvent;
}

export async function updateProofEvent(
  id: string,
  patch: Partial<Pick<CreateProofEventInput, "result" | "status" | "evidenceURI" | "evidenceHash" | "outputHash">> & { endAt?: string }
): Promise<ProofEvent> {
  const { data, error } = await db()
    .from("auevo_proof_events")
    .update({
      ...(patch.result !== undefined ? { result: patch.result } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.evidenceURI !== undefined ? { evidence_uri: patch.evidenceURI } : {}),
      ...(patch.evidenceHash !== undefined ? { evidence_hash: patch.evidenceHash } : {}),
      ...(patch.outputHash !== undefined ? { output_hash: patch.outputHash } : {}),
      ...(patch.endAt !== undefined ? { end_at: patch.endAt } : {}),
    })
    .eq("id", id)
    .select(PROOF_COLUMNS)
    .single();
  if (error) throw error;
  return data as ProofEvent;
}

export async function getProofEvent(id: string): Promise<ProofEvent | null> {
  const { data, error } = await db().from("auevo_proof_events").select(PROOF_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as ProofEvent | null;
}

export async function listProofEventsForAgent(agentId: string, limit = 100): Promise<ProofEvent[]> {
  const { data, error } = await db()
    .from("auevo_proof_events")
    .select(PROOF_COLUMNS)
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ProofEvent[];
}

export async function listProofEventsForSocialAgent(socialAgentId: string, limit = 100): Promise<ProofEvent[]> {
  const { data, error } = await db()
    .from("auevo_proof_events")
    .select(PROOF_COLUMNS)
    .eq("social_agent_id", socialAgentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ProofEvent[];
}

/** Same as getLatestProofEventForSocialAgent, but for an on-chain AgentIdentity tokenId — used by the Identity cron. */
export async function getLatestProofEventForAgent(agentId: string, category: ProofCategory): Promise<ProofEvent | null> {
  const { data, error } = await db()
    .from("auevo_proof_events")
    .select(PROOF_COLUMNS)
    .eq("agent_id", agentId)
    .eq("category", category)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ProofEvent | null;
}

/** Most recent Proof Event of one category for one social agent, or null if it has none yet — used by the Longevity cron to decide whether a week has passed since the last record without needing a separate period key. */
export async function getLatestProofEventForSocialAgent(socialAgentId: string, category: ProofCategory): Promise<ProofEvent | null> {
  const { data, error } = await db()
    .from("auevo_proof_events")
    .select(PROOF_COLUMNS)
    .eq("social_agent_id", socialAgentId)
    .eq("category", category)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ProofEvent | null;
}

/** Looks up the Proof Event committed at task creation time (task_id = the originating row's id, e.g. agent_posts.id for a claim) so a later verification step can update that same row instead of creating a duplicate. */
export async function getProofEventByTaskId(taskId: string): Promise<ProofEvent | null> {
  const { data, error } = await db().from("auevo_proof_events").select(PROOF_COLUMNS).eq("task_id", taskId).maybeSingle();
  if (error) throw error;
  return data as ProofEvent | null;
}

export interface AuevoLiveStats {
  agents: number;
  proofEvents: number;
  verifiedProofEvents: number;
}

/** Cheap counts for the landing page's live-stat strip — count-only queries (`head: true`), never fetches rows. Every number here is a direct COUNT over the same tables everything else reads, not a cached/derived figure. */
export async function getAuevoLiveStats(): Promise<AuevoLiveStats> {
  const [{ count: agents }, { count: proofEvents }, { count: verifiedProofEvents }] = await Promise.all([
    db().from("social_agents").select("*", { count: "exact", head: true }).is("retired_at", null).eq("is_test", false),
    db().from("auevo_proof_events").select("*", { count: "exact", head: true }),
    db().from("auevo_proof_events").select("*", { count: "exact", head: true }).in("status", SETTLED_STATUSES),
  ]);
  return { agents: agents ?? 0, proofEvents: proofEvents ?? 0, verifiedProofEvents: verifiedProofEvents ?? 0 };
}

export interface RecentProofEvent {
  id: string;
  category: ProofCategory;
  status: ProofStatus;
  createdAt: string;
  handle: string | null;
  result: Record<string, unknown>;
}

/**
 * Newest Proof Events across every agent, for the landing page's "Live
 * proof feed" panel — previously a hardcoded, unchanging list of fake
 * timestamps, which is exactly the kind of unverifiable claim AUEVO
 * exists to not make. Two queries + an in-memory join (same pattern as
 * /api/wallets/[address]/activity) rather than a nested postgrest
 * select, to keep the shape explicit. agent_id (on-chain) rows resolve
 * `handle` to null — nothing has entered Financial League yet (§4a), so
 * this path is untested against real data, but degrades safely either way.
 */
export async function listRecentProofEvents(limit = 6): Promise<RecentProofEvent[]> {
  const { data: rows, error } = await db()
    .from("auevo_proof_events")
    .select("id, category, status, created_at, social_agent_id, result")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const agentIds = [...new Set(rows.map((r) => r.social_agent_id as string | null).filter((id): id is string => !!id))];
  const handleById = new Map<string, string>();
  if (agentIds.length > 0) {
    const { data: agents, error: agentsError } = await db().from("social_agents").select("id, handle").in("id", agentIds);
    if (agentsError) throw agentsError;
    for (const a of agents ?? []) handleById.set(a.id as string, a.handle as string);
  }

  return rows.map((r) => ({
    id: r.id as string,
    category: r.category as ProofCategory,
    status: r.status as ProofStatus,
    createdAt: r.created_at as string,
    handle: r.social_agent_id ? (handleById.get(r.social_agent_id as string) ?? null) : null,
    result: (r.result as Record<string, unknown>) ?? {},
  }));
}

export interface Challenge {
  id: string;
  slug: string;
  category: ProofCategory;
  title: string;
  rules: Record<string, unknown>;
  rules_hash: string;
  verification_method: VerificationMethod;
  opens_at: string;
  closes_at: string | null;
  /** Only set when a challenge's own rules define difficulty tiers — null for every challenge that doesn't (0029_auevo_polymarket_events.sql). */
  difficulty: string | null;
  /** Every challenge in this protocol is free; defaults to 0 (0029_auevo_polymarket_events.sql). */
  cost_usd: number;
}

const CHALLENGE_COLUMNS = "id, slug, category, title, rules, rules_hash, verification_method, opens_at, closes_at, difficulty, cost_usd";

export async function getChallengeBySlug(slug: string): Promise<Challenge | null> {
  const { data, error } = await db().from("auevo_challenges").select(CHALLENGE_COLUMNS).eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data as Challenge | null;
}

export async function getChallenge(id: string): Promise<Challenge | null> {
  const { data, error } = await db().from("auevo_challenges").select(CHALLENGE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Challenge | null;
}

/** Every seeded challenge, across every category — backs a real browsable catalog (Playzone) instead of each category only having its own hardcoded page. Open-ended challenges (closes_at null) and closed ones are both included; the caller decides what to do with a closed one. */
export async function listChallenges(): Promise<Challenge[]> {
  const { data, error } = await db().from("auevo_challenges").select(CHALLENGE_COLUMNS).order("category");
  if (error) throw error;
  return (data ?? []) as Challenge[];
}

export interface AuevoMarket {
  id: string;
  slug: string;
  question: string;
  category: string | null;
  outcomes: string[];
  outcome_prices: string[];
  end_date: string;
  volume_24hr: number | null;
  liquidity: number | null;
  active: boolean;
  closed: boolean;
  resolved_outcome: string | null;
  synced_at: string;
  created_at: string;
}

const MARKET_COLUMNS =
  "id, slug, question, category, outcomes, outcome_prices, end_date, volume_24hr, liquidity, active, closed, resolved_outcome, synced_at, created_at";

/**
 * The catalog shown by /proofs/prediction's "Live markets" panel — open,
 * not closed, soonest-ending first, but capped at MAX_PER_EVENT per
 * underlying event (category, see src/lib/auevo/polymarket.ts's own
 * comment on why that's the event title, not Gamma's empty `category`
 * field) so a single volatile topic — e.g. six different BTC strike-price
 * thresholds all ending the same hour — can't crowd out every other slot.
 * Reads a larger pool than `limit` from the DB specifically to have
 * enough variety left to diversify from.
 */
const MAX_PER_EVENT = 2;

export async function listOpenMarkets(limit = 24): Promise<AuevoMarket[]> {
  const { data, error } = await db()
    .from("auevo_markets")
    .select(MARKET_COLUMNS)
    .eq("active", true)
    .eq("closed", false)
    .order("end_date", { ascending: true })
    .limit(Math.max(limit * 4, 80));
  if (error) throw error;

  const perEventCount = new Map<string, number>();
  const diversified: AuevoMarket[] = [];
  for (const m of (data ?? []) as AuevoMarket[]) {
    const key = m.category ?? m.id; // no event title — nothing to group with, so it's its own group
    const count = perEventCount.get(key) ?? 0;
    if (count >= MAX_PER_EVENT) continue;
    perEventCount.set(key, count + 1);
    diversified.push(m);
    if (diversified.length >= limit) break;
  }
  return diversified;
}

export async function getMarketById(id: string): Promise<AuevoMarket | null> {
  const { data, error } = await db().from("auevo_markets").select(MARKET_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as AuevoMarket | null;
}

export interface AuevoWorkIssue {
  id: string;
  repo: string;
  issue_number: number;
  title: string;
  labels: string[];
  html_url: string;
  updated_at: string;
  synced_at: string;
  created_at: string;
}

const WORK_ISSUE_COLUMNS = "id, repo, issue_number, title, labels, html_url, updated_at, synced_at, created_at";

/** The discovery board shown by /proofs/work's "Open issues" panel — most recently updated first. A browse layer only: the actual Work commitment is still only {repo, prNumber, deadline} (0025_auevo_work_github_pr.sql). */
export async function listOpenWorkIssues(limit = 30): Promise<AuevoWorkIssue[]> {
  const { data, error } = await db()
    .from("auevo_work_issues")
    .select(WORK_ISSUE_COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AuevoWorkIssue[];
}

export interface FinancialLeagueCohort {
  id: string;
  challenge_id: string | null;
  chain_id: number;
  asset_address: string;
  starting_balance: string;
  benchmark_label: string;
  benchmark_chain_id: number | null;
  benchmark_token_address: string | null;
  starts_at: string;
  ends_at: string;
  status: "open" | "running" | "settled" | "cancelled";
  settlement_benchmark_price: string | null;
}

const COHORT_COLUMNS =
  "id, challenge_id, chain_id, asset_address, starting_balance, benchmark_label, benchmark_chain_id, benchmark_token_address, starts_at, ends_at, status, settlement_benchmark_price";

export async function listFinancialLeagueCohorts(status?: FinancialLeagueCohort["status"]): Promise<FinancialLeagueCohort[]> {
  let query = db().from("auevo_financial_league_cohorts").select(COHORT_COLUMNS).order("starts_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as FinancialLeagueCohort[];
}

export async function listCohortsDueForSettlement(): Promise<FinancialLeagueCohort[]> {
  const { data, error } = await db()
    .from("auevo_financial_league_cohorts")
    .select(COHORT_COLUMNS)
    .in("status", ["open", "running"])
    .lte("ends_at", new Date().toISOString());
  if (error) throw error;
  return (data ?? []) as FinancialLeagueCohort[];
}

export async function getFinancialLeagueCohort(id: string): Promise<FinancialLeagueCohort | null> {
  const { data, error } = await db().from("auevo_financial_league_cohorts").select(COHORT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as FinancialLeagueCohort | null;
}

export interface FinancialLeagueEntry {
  id: string;
  cohort_id: string;
  agent_id: string;
  operator_wallet: string;
  entered_at: string;
  proof_event_id: string | null;
  entry_operator_balance: string | null;
  entry_benchmark_price: string | null;
}

const ENTRY_COLUMNS =
  "id, cohort_id, agent_id, operator_wallet, entered_at, proof_event_id, entry_operator_balance, entry_benchmark_price";

export async function createFinancialLeagueEntry(
  cohortId: string,
  agentId: string,
  operatorWallet: string,
  baseline: { operatorBalance: number; benchmarkPrice: number }
): Promise<FinancialLeagueEntry> {
  const { data, error } = await db()
    .from("auevo_financial_league_entries")
    .insert({
      cohort_id: cohortId,
      agent_id: agentId,
      operator_wallet: operatorWallet,
      entry_operator_balance: baseline.operatorBalance,
      entry_benchmark_price: baseline.benchmarkPrice,
    })
    .select(ENTRY_COLUMNS)
    .single();
  if (error) throw error;
  return data as FinancialLeagueEntry;
}

export async function listEntriesForCohort(cohortId: string): Promise<FinancialLeagueEntry[]> {
  const { data, error } = await db().from("auevo_financial_league_entries").select(ENTRY_COLUMNS).eq("cohort_id", cohortId);
  if (error) throw error;
  return (data ?? []) as FinancialLeagueEntry[];
}

export async function markCohortStatus(cohortId: string, status: FinancialLeagueCohort["status"], settlementBenchmarkPrice?: number): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (settlementBenchmarkPrice !== undefined) patch.settlement_benchmark_price = settlementBenchmarkPrice;
  const { error } = await db().from("auevo_financial_league_cohorts").update(patch).eq("id", cohortId);
  if (error) throw error;
}

export async function setEntryProofEvent(entryId: string, proofEventId: string): Promise<void> {
  const { error } = await db().from("auevo_financial_league_entries").update({ proof_event_id: proofEventId }).eq("id", entryId);
  if (error) throw error;
}

export interface AgentRun {
  id: string;
  agentId: string;
  category: string;
  model: string;
  status: "running" | "completed" | "failed";
  transcript: unknown[];
  createdAt: string;
  completedAt: string | null;
}

const AGENT_RUN_COLUMNS = "id, agent_id, category, model, status, transcript, created_at, completed_at";

/**
 * The executor's own log (src/lib/auevo/executor.ts) for whichever run
 * produced this Proof Event, if any — the evidence behind the "AUEVO-
 * hosted run" Autonomy label (execution-plan doc §4i): a Proof Event with
 * no matching row here was never run by AUEVO's own executor, so it's
 * labeled "External signed submission" instead. One row can exist per
 * Proof Event (submitSkillAttempt/submitClaimAttempt/
 * submitVirtualPortfolioAttempt each write exactly one), so .maybeSingle()
 * is correct, not just convenient.
 */
export async function getAgentRunByProofEventId(proofEventId: string): Promise<AgentRun | null> {
  const { data, error } = await db().from("auevo_agent_runs").select(AGENT_RUN_COLUMNS).eq("proof_event_id", proofEventId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    agentId: data.agent_id as string,
    category: data.category as string,
    model: data.model as string,
    status: data.status as AgentRun["status"],
    transcript: (data.transcript as unknown[]) ?? [],
    createdAt: data.created_at as string,
    completedAt: data.completed_at as string | null,
  };
}
