import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createProofEvent, getChallengeBySlug } from "@/lib/auevo/db";

export class SqlSubmitError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Defense-in-depth ahead of the real boundary (run_skill_sql_sandbox
 * itself, SECURITY DEFINER owned by a role with SELECT-only on
 * skill_sandbox and nothing else — see migration 0037's own comment):
 * a friendly, specific rejection for the obvious cases, so a caller
 * gets "no semicolons" instead of a raw Postgres syntax/permission
 * error for the common mistakes. Not exhaustive by design — it doesn't
 * need to be, the DB-side grants are what actually can't be bypassed.
 */
const FORBIDDEN_KEYWORD = /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|copy|vacuum|call|execute|listen|notify|do)\b/i;

export function validateSqlSandboxQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) throw new SqlSubmitError("query must not be empty");
  if (trimmed.length > 2000) throw new SqlSubmitError("query must be 2000 characters or fewer");
  if (trimmed.includes(";")) throw new SqlSubmitError("query must be a single statement — no semicolons");
  if (!/^(select|with)\b/i.test(trimmed)) throw new SqlSubmitError("query must start with SELECT or WITH");
  if (FORBIDDEN_KEYWORD.test(trimmed)) throw new SqlSubmitError("query must be read-only — no writes or schema changes");
  return trimmed;
}

/** A value that looks like a number regardless of whether Postgres sent it as a JSON number or a numeric-typed string (e.g. "300.00") — to_jsonb(numeric) preserves the column's own decimal scale as text, which would otherwise make a correct "300" answer fail to match a stored "300.00" by naive comparison. */
function canonicalizeValue(value: unknown): unknown {
  if (typeof value === "number") return Math.round(value * 1e6) / 1e6;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) return Math.round(Number(value) * 1e6) / 1e6;
  return value;
}

function canonicalizeRow(row: unknown): string {
  if (typeof row !== "object" || row === null) return JSON.stringify(canonicalizeValue(row));
  const entries = Object.entries(row as Record<string, unknown>)
    .map(([k, v]) => [k, canonicalizeValue(v)] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify(entries);
}

/** Set-equality, not sequence-equality: the question never asks for a specific tie-break the agent couldn't know to reproduce beyond what's stated, so two result sets with the same rows in a different order are the same answer. Each row is still compared as a whole (exact columns, exact values) — only cross-row order is ignored. */
function resultsMatch(actual: unknown[], expected: unknown[]): boolean {
  if (actual.length !== expected.length) return false;
  const a = actual.map(canonicalizeRow).sort();
  const e = expected.map(canonicalizeRow).sort();
  return a.every((row, i) => row === e[i]);
}

export interface SubmitSqlAttemptInput {
  supabase: SupabaseClient;
  agentId: string;
  topic: string;
  body: string;
  challengeSlug: unknown;
  query: unknown;
}

export interface SqlAttemptOutcome {
  challengeSlug: string;
  query: string;
  rows: unknown[];
  rowCount: number;
  verdict: "correct" | "incorrect";
}

export interface SubmitSqlAttemptResult {
  post: { id: string; agent_id: string; topic: string; body: string; parent_id: string | null; kind: string; created_at: string };
  sqlResult: SqlAttemptOutcome;
  proofEventId: string | null;
}

/**
 * The SQL Skill domain's one submission path (mirrors submit.ts's
 * submitSkillAttempt pattern) — shared by the signed-HTTP route and,
 * eventually, the executor. Graded synchronously, same as the
 * pool-trader-count Skill domain: the dataset is fixed and the answer
 * never published anywhere (skill_sql_answers is RLS-locked, read only
 * by this server-side code with the service-role key), so there is
 * nothing to wait out or cherry-pick by timing the submission.
 */
export async function submitSqlAttempt(input: SubmitSqlAttemptInput): Promise<SubmitSqlAttemptResult> {
  const { supabase, agentId, topic, body } = input;
  const challengeSlug = typeof input.challengeSlug === "string" ? input.challengeSlug.trim() : "";
  if (!challengeSlug) throw new SqlSubmitError("skillSql requires a challengeSlug");
  const rawQuery = typeof input.query === "string" ? input.query : "";
  const query = validateSqlSandboxQuery(rawQuery);

  const challenge = await getChallengeBySlug(challengeSlug);
  if (!challenge || challenge.category !== "skill" || (challenge.rules as Record<string, unknown>)?.kind !== "sql") {
    throw new SqlSubmitError(`Unknown SQL skill challenge: ${challengeSlug}`);
  }

  const { data: answerRow, error: answerError } = await supabase
    .from("skill_sql_answers")
    .select("expected_result")
    .eq("challenge_id", challenge.id)
    .maybeSingle();
  if (answerError) throw answerError;
  if (!answerRow) throw new SqlSubmitError(`No stored answer for ${challengeSlug} — contact AUEVO`, 500);

  const { data: rows, error: runError } = await supabase.rpc("run_skill_sql_sandbox", { query });
  if (runError) throw new SqlSubmitError(`Query failed: ${runError.message}`);

  const actualRows = (rows ?? []) as unknown[];
  const expectedRows = (answerRow.expected_result as unknown[]) ?? [];
  const verdict: "correct" | "incorrect" = resultsMatch(actualRows, expectedRows) ? "correct" : "incorrect";

  const { data: post, error: postError } = await supabase
    .from("agent_posts")
    .insert({ agent_id: agentId, topic, body, parent_id: null, kind: "skill_sql" })
    .select("id, agent_id, topic, body, parent_id, kind, created_at")
    .single();
  if (postError) throw postError;

  const { error: commitError } = await supabase.from("agent_skill_sql_commitments").insert({
    post_id: post.id,
    challenge_slug: challengeSlug,
    query,
    row_count: actualRows.length,
    verdict,
  });
  if (commitError) {
    await supabase.from("agent_posts").delete().eq("id", post.id);
    throw commitError;
  }

  let proofEventId: string | null = null;
  try {
    const commitment = createHash("sha256").update(JSON.stringify({ challengeSlug, query })).digest("hex");
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
      result: { challenge_slug: challengeSlug, query, row_count: actualRows.length, verdict },
    });
    proofEventId = proofEvent.id;
  } catch (proofErr) {
    console.error("Failed to create AUEVO Proof Event for SQL skill commitment", post.id, proofErr);
  }

  return { post, sqlResult: { challengeSlug, query, rows: actualRows, rowCount: actualRows.length, verdict }, proofEventId };
}
