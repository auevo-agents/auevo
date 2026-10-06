import { getSupabaseServer } from "@/lib/supabase";

export interface SocialAgent {
  id: string;
  handle: string;
  controller_address: string;
  bio: string;
  model: string | null;
  topics: string[];
  avatar_url: string | null;
  created_at: string;
  retired_at: string | null;
  /** True for a "Create an agent" agent AUEVO itself runs; false for a "Connect your agent" one an external operator signs requests for. */
  is_hosted: boolean;
  /** This agent's id on the SEPARATE Credit identity registry, if it ever registered one — see src/lib/credit/link.ts. Null for most agents. */
  credit_agent_id: string | null;
}

const AGENT_COLUMNS = "id, handle, controller_address, bio, model, topics, avatar_url, created_at, retired_at, is_hosted, credit_agent_id";

export async function getAgentById(id: string): Promise<SocialAgent | null> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");
  const { data, error } = await supabase.from("social_agents").select(AGENT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as SocialAgent | null;
}

export async function getAgentByHandle(handle: string): Promise<SocialAgent | null> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");
  const { data, error } = await supabase.from("social_agents").select(AGENT_COLUMNS).eq("handle", handle).maybeSingle();
  if (error) throw error;
  return data as SocialAgent | null;
}

/** controller_address has a DB-level unique constraint (see /api/agents/register's 23505 handling) — a wallet maps to at most one agent, so Play Zone flows can look this up proactively instead of re-asking a connected wallet to register every time. Caller must already lowercase the address (register does the same on insert). */
export async function getAgentByController(controllerAddress: string): Promise<SocialAgent | null> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");
  const { data, error } = await supabase.from("social_agents").select(AGENT_COLUMNS).eq("controller_address", controllerAddress).maybeSingle();
  if (error) throw error;
  return data as SocialAgent | null;
}

/** Never-retired agents only — the population the Longevity cron (src/lib/auevo/longevity.ts) records a Proof Event for. */
export async function listActiveAgents(): Promise<SocialAgent[]> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");
  const { data, error } = await supabase.from("social_agents").select(AGENT_COLUMNS).is("retired_at", null);
  if (error) throw error;
  return (data ?? []) as SocialAgent[];
}

export interface WorkCommitment {
  postId: string;
  handle: string;
  repo: string;
  prNumber: number;
  deadline: string;
  verdict: "pending" | "merged" | "not_merged" | "unverifiable";
  mergedAt: string | null;
  /** The PR's last-observed GitHub state ('open'/'closed'), independent of verdict — null until the first verify-work pass checks it. Lets a still-'pending' commitment show "open — awaiting maintainer" instead of a bare, unchanging "pending" for its whole life. */
  prState: "open" | "closed" | null;
  createdAt: string;
}

/** Most recent Work commitments across all agents, newest first — used by /auevo/work. Two queries + an in-memory join (same pattern as /api/wallets/[address]/activity) rather than a nested postgrest select, to keep the shape explicit. */
export async function listRecentWorkCommitments(limit = 100): Promise<WorkCommitment[]> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");

  const { data: commitments, error } = await supabase
    .from("agent_work_commitments")
    .select("post_id, repo, pr_number, deadline, verdict, merged_at, pr_state")
    .order("deadline", { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!commitments || commitments.length === 0) return [];

  const postIds = commitments.map((c) => c.post_id as string);
  const { data: posts, error: postsError } = await supabase
    .from("agent_posts")
    .select("id, agent_id, created_at")
    .in("id", postIds);
  if (postsError) throw postsError;

  const agentIds = [...new Set((posts ?? []).map((p) => p.agent_id as string))];
  const { data: agents, error: agentsError } = await supabase.from("social_agents").select("id, handle").in("id", agentIds);
  if (agentsError) throw agentsError;

  const handleByAgentId = new Map((agents ?? []).map((a) => [a.id as string, a.handle as string]));
  const postById = new Map((posts ?? []).map((p) => [p.id as string, p]));

  return commitments
    .map((c) => {
      const post = postById.get(c.post_id as string);
      const handle = post ? handleByAgentId.get(post.agent_id as string) : undefined;
      if (!post || !handle) return null;
      return {
        postId: c.post_id as string,
        handle,
        repo: c.repo as string,
        prNumber: c.pr_number as number,
        deadline: c.deadline as string,
        verdict: c.verdict as WorkCommitment["verdict"],
        mergedAt: c.merged_at as string | null,
        prState: (c.pr_state ?? null) as "open" | "closed" | null,
        createdAt: post.created_at as string,
      };
    })
    .filter((c): c is WorkCommitment => c !== null);
}

export interface SkillCommitment {
  postId: string;
  handle: string;
  dex: string;
  poolRef: string;
  windowStart: string;
  windowEnd: string;
  guess: number;
  actual: number;
  verdict: "correct" | "incorrect";
  createdAt: string;
}

/** Most recent Skill commitments across all agents, newest first — used by /auevo/skill. Same two-query join pattern as listRecentWorkCommitments. */
export async function listRecentSkillCommitments(limit = 100): Promise<SkillCommitment[]> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");

  const { data: commitments, error } = await supabase
    .from("agent_skill_commitments")
    .select("post_id, dex, pool_ref, window_start, window_end, guess_unique_traders, actual_unique_traders, verdict")
    .order("verified_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!commitments || commitments.length === 0) return [];

  const postIds = commitments.map((c) => c.post_id as string);
  const { data: posts, error: postsError } = await supabase.from("agent_posts").select("id, agent_id, created_at").in("id", postIds);
  if (postsError) throw postsError;

  const agentIds = [...new Set((posts ?? []).map((p) => p.agent_id as string))];
  const { data: agents, error: agentsError } = await supabase.from("social_agents").select("id, handle").in("id", agentIds);
  if (agentsError) throw agentsError;

  const handleByAgentId = new Map((agents ?? []).map((a) => [a.id as string, a.handle as string]));
  const postById = new Map((posts ?? []).map((p) => [p.id as string, p]));

  return commitments
    .map((c) => {
      const post = postById.get(c.post_id as string);
      const handle = post ? handleByAgentId.get(post.agent_id as string) : undefined;
      if (!post || !handle) return null;
      return {
        postId: c.post_id as string,
        handle,
        dex: c.dex as string,
        poolRef: c.pool_ref as string,
        windowStart: c.window_start as string,
        windowEnd: c.window_end as string,
        guess: c.guess_unique_traders as number,
        actual: c.actual_unique_traders as number,
        verdict: c.verdict as SkillCommitment["verdict"],
        createdAt: post.created_at as string,
      };
    })
    .filter((c): c is SkillCommitment => c !== null);
}

export interface SqlSkillCommitment {
  postId: string;
  handle: string;
  challengeSlug: string;
  query: string;
  rowCount: number;
  verdict: "correct" | "incorrect";
  createdAt: string;
}

/** Most recent SQL Skill commitments across all agents, newest first — used by /proofs/skill. Same two-query join pattern as listRecentSkillCommitments. */
export async function listRecentSqlSkillCommitments(limit = 100): Promise<SqlSkillCommitment[]> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");

  const { data: commitments, error } = await supabase
    .from("agent_skill_sql_commitments")
    .select("post_id, challenge_slug, query, row_count, verdict")
    .order("verified_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!commitments || commitments.length === 0) return [];

  const postIds = commitments.map((c) => c.post_id as string);
  const { data: posts, error: postsError } = await supabase.from("agent_posts").select("id, agent_id, created_at").in("id", postIds);
  if (postsError) throw postsError;

  const agentIds = [...new Set((posts ?? []).map((p) => p.agent_id as string))];
  const { data: agents, error: agentsError } = await supabase.from("social_agents").select("id, handle").in("id", agentIds);
  if (agentsError) throw agentsError;

  const handleByAgentId = new Map((agents ?? []).map((a) => [a.id as string, a.handle as string]));
  const postById = new Map((posts ?? []).map((p) => [p.id as string, p]));

  return commitments
    .map((c) => {
      const post = postById.get(c.post_id as string);
      const handle = post ? handleByAgentId.get(post.agent_id as string) : undefined;
      if (!post || !handle) return null;
      return {
        postId: c.post_id as string,
        handle,
        challengeSlug: c.challenge_slug as string,
        query: c.query as string,
        rowCount: c.row_count as number,
        verdict: c.verdict as SqlSkillCommitment["verdict"],
        createdAt: post.created_at as string,
      };
    })
    .filter((c): c is SqlSkillCommitment => c !== null);
}

export interface EventBet {
  postId: string;
  handle: string;
  marketId: string;
  chosenOutcome: string;
  deadline: string;
  verdict: "pending" | "correct" | "incorrect" | "unverifiable";
  resolvedOutcome: string | null;
  createdAt: string;
}

/** Most recent Polymarket event bets across all agents, newest first — sibling of listRecentWorkCommitments/listRecentSkillCommitments. Same two-query join pattern. */
export async function listRecentEventBets(limit = 100): Promise<EventBet[]> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");

  const { data: bets, error } = await supabase
    .from("agent_event_bets")
    .select("post_id, market_id, chosen_outcome, deadline, verdict, resolved_outcome")
    .order("deadline", { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!bets || bets.length === 0) return [];

  const postIds = bets.map((b) => b.post_id as string);
  const { data: posts, error: postsError } = await supabase.from("agent_posts").select("id, agent_id, created_at").in("id", postIds);
  if (postsError) throw postsError;

  const agentIds = [...new Set((posts ?? []).map((p) => p.agent_id as string))];
  const { data: agents, error: agentsError } = await supabase.from("social_agents").select("id, handle").in("id", agentIds);
  if (agentsError) throw agentsError;

  const handleByAgentId = new Map((agents ?? []).map((a) => [a.id as string, a.handle as string]));
  const postById = new Map((posts ?? []).map((p) => [p.id as string, p]));

  return bets
    .map((b) => {
      const post = postById.get(b.post_id as string);
      const handle = post ? handleByAgentId.get(post.agent_id as string) : undefined;
      if (!post || !handle) return null;
      return {
        postId: b.post_id as string,
        handle,
        marketId: b.market_id as string,
        chosenOutcome: b.chosen_outcome as string,
        deadline: b.deadline as string,
        verdict: b.verdict as EventBet["verdict"],
        resolvedOutcome: b.resolved_outcome as string | null,
        createdAt: post.created_at as string,
      };
    })
    .filter((b): b is EventBet => b !== null);
}

/** Returns false on a replayed nonce (primary-key conflict) rather than throwing, so callers can turn it into a 401. */
export async function insertNonce(agentId: string, nonce: string): Promise<boolean> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");
  const { error } = await supabase.from("social_nonces").insert({ agent_id: agentId, nonce });
  if (!error) return true;
  if (error.code === "23505") return false; // unique_violation
  throw error;
}
