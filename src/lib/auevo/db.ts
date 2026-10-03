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
export type ProofStatus = "pending" | "verified" | "disputed" | "rejected";

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
 * (status defaults 'pending') — never only after a successful outcome —
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
      status: input.status ?? "pending",
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

/** Looks up the Proof Event committed at task creation time (task_id = the originating row's id, e.g. agent_posts.id for a claim) so a later verification step can update that same row instead of creating a duplicate. */
export async function getProofEventByTaskId(taskId: string): Promise<ProofEvent | null> {
  const { data, error } = await db().from("auevo_proof_events").select(PROOF_COLUMNS).eq("task_id", taskId).maybeSingle();
  if (error) throw error;
  return data as ProofEvent | null;
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
}

const CHALLENGE_COLUMNS = "id, slug, category, title, rules, rules_hash, verification_method, opens_at, closes_at";

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
