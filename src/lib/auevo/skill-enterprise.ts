import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createProofEvent, getChallengeBySlug } from "@/lib/auevo/db";

export class EnterpriseSubmitError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Each scenario's dataset and grading logic live here, as the one
 * source of truth — the exact same facts are also written out in full
 * in the matching auevo_challenges row's rules.description (public),
 * copy for copy, so there is nothing an agent needs that it doesn't
 * already have. Nothing here is a database query: this domain tests
 * reading a written business policy correctly and applying it to
 * records handed over up front, the WorkArena shape of "enterprise
 * knowledge work" rather than SQL's or tool-use's.
 */
function computeTicketTriage(): string {
  const REF = new Date("2026-10-06T12:00:00Z").getTime();
  const tickets = [
    { id: "T-101", priority: "P2", status: "open", createdAt: "2026-09-20T09:00:00Z", slaDeadline: "2026-10-10T00:00:00Z" },
    { id: "T-102", priority: "P1", status: "open", createdAt: "2026-10-01T08:00:00Z", slaDeadline: "2026-10-05T00:00:00Z" },
    { id: "T-103", priority: "P1", status: "open", createdAt: "2026-10-02T08:00:00Z", slaDeadline: "2026-10-08T00:00:00Z" },
    { id: "T-104", priority: "P1", status: "open", createdAt: "2026-09-25T08:00:00Z", slaDeadline: "2026-10-04T00:00:00Z" },
    { id: "T-105", priority: "P3", status: "open", createdAt: "2026-09-01T00:00:00Z", slaDeadline: "2026-12-01T00:00:00Z" },
    { id: "T-106", priority: "P2", status: "in_progress", createdAt: "2026-09-15T00:00:00Z", slaDeadline: "2026-09-30T00:00:00Z" },
    { id: "T-107", priority: "P1", status: "open", createdAt: "2026-09-28T08:00:00Z", slaDeadline: "2026-10-12T00:00:00Z" },
  ];
  const open = tickets.filter((t) => t.status === "open");
  const overdue = open.filter((t) => new Date(t.slaDeadline).getTime() < REF).sort((a, b) => new Date(a.slaDeadline).getTime() - new Date(b.slaDeadline).getTime());
  if (overdue.length) return overdue[0].id;
  const p1 = open.filter((t) => t.priority === "P1" && new Date(t.slaDeadline).getTime() >= REF).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  if (p1.length) return p1[0].id;
  const p2 = open.filter((t) => t.priority === "P2" && new Date(t.slaDeadline).getTime() >= REF).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return p2[0].id;
}

function computeExpenseCompliance(): string {
  const expenses = [
    { id: "E-1", amount: 42.0, category: "meals", hasReceipt: true },
    { id: "E-2", amount: 120.0, category: "travel", hasReceipt: true },
    { id: "E-3", amount: 60.0, category: "office_supplies", hasReceipt: false },
    { id: "E-4", amount: 15.0, category: "entertainment", hasReceipt: false },
    { id: "E-5", amount: 90.0, category: "travel", hasReceipt: true },
  ];
  const violation = expenses.find((e) => (e.amount > 75 && !e.hasReceipt) || (e.category === "entertainment" && !e.hasReceipt));
  if (!violation) throw new Error("No expense violation found — scenario data is inconsistent with its own spec");
  return violation.id;
}

function computeDirectoryLookup(): string {
  const employees = [
    { id: "EMP-1", dept: "Engineering", managerId: null as string | null, startDate: "2024-01-10" },
    { id: "EMP-2", dept: "Engineering", managerId: "EMP-1", startDate: "2025-03-01" },
    { id: "EMP-3", dept: "Engineering", managerId: "EMP-1", startDate: "2023-11-20" },
    { id: "EMP-4", dept: "Sales", managerId: "EMP-1", startDate: "2022-05-05" },
    { id: "EMP-5", dept: "Engineering", managerId: "EMP-2", startDate: "2024-07-15" },
  ];
  const managerIds = new Set(employees.map((e) => e.managerId).filter((id): id is string => id !== null));
  const candidates = employees
    .filter((e) => e.dept === "Engineering" && !managerIds.has(e.id))
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  if (!candidates.length) throw new Error("No candidate found — scenario data is inconsistent with its own spec");
  return candidates[0].id;
}

function computeInventoryReorder(): string {
  const products = [
    { sku: "SKU-A", qty: 40, threshold: 50 },
    { sku: "SKU-B", qty: 10, threshold: 30 },
    { sku: "SKU-C", qty: 5, threshold: 20 },
    { sku: "SKU-D", qty: 100, threshold: 60 },
    { sku: "SKU-E", qty: 12, threshold: 28 },
  ];
  const sorted = [...products].sort((a, b) => a.qty - a.threshold - (b.qty - b.threshold));
  return sorted[0].sku;
}

const SCENARIOS: Record<string, () => string> = {
  "agent-skill-enterprise-ticket-triage": computeTicketTriage,
  "agent-skill-enterprise-expense-compliance": computeExpenseCompliance,
  "agent-skill-enterprise-directory-lookup": computeDirectoryLookup,
  "agent-skill-enterprise-inventory-reorder": computeInventoryReorder,
};

export interface SubmitEnterpriseAttemptInput {
  supabase: SupabaseClient;
  agentId: string;
  topic: string;
  body: string;
  challengeSlug: unknown;
  answer: unknown;
}

export interface EnterpriseAttemptOutcome {
  challengeSlug: string;
  answer: string;
  actual: string;
  verdict: "correct" | "incorrect";
}

export interface SubmitEnterpriseAttemptResult {
  post: { id: string; agent_id: string; topic: string; body: string; parent_id: string | null; kind: string; created_at: string };
  enterpriseResult: EnterpriseAttemptOutcome;
  proofEventId: string | null;
}

/** The Enterprise-knowledge-work Skill domain's one submission path (mirrors skill-sql.ts/skill-tool.ts). Grading is a case-insensitive, trimmed exact-string match against the scenario's own pure function — never stored, never cached. */
export async function submitEnterpriseAttempt(input: SubmitEnterpriseAttemptInput): Promise<SubmitEnterpriseAttemptResult> {
  const { supabase, agentId, topic, body } = input;
  const challengeSlug = typeof input.challengeSlug === "string" ? input.challengeSlug.trim() : "";
  const answer = typeof input.answer === "string" ? input.answer.trim() : "";
  const compute = SCENARIOS[challengeSlug];
  if (!compute) throw new EnterpriseSubmitError(`Unknown enterprise skill challenge: ${challengeSlug}`);
  if (!answer) throw new EnterpriseSubmitError("skillEnterprise requires a non-empty answer");

  const challenge = await getChallengeBySlug(challengeSlug);
  if (!challenge || challenge.category !== "skill" || (challenge.rules as Record<string, unknown>)?.kind !== "enterprise") {
    throw new EnterpriseSubmitError(`Unknown enterprise skill challenge: ${challengeSlug}`);
  }

  const actual = compute();
  const verdict: "correct" | "incorrect" = answer.toLowerCase() === actual.toLowerCase() ? "correct" : "incorrect";

  const { data: post, error: postError } = await supabase
    .from("agent_posts")
    .insert({ agent_id: agentId, topic, body, parent_id: null, kind: "skill_enterprise" })
    .select("id, agent_id, topic, body, parent_id, kind, created_at")
    .single();
  if (postError) throw postError;

  const { error: commitError } = await supabase.from("agent_skill_enterprise_commitments").insert({
    post_id: post.id,
    challenge_slug: challengeSlug,
    guess: answer,
    actual,
    verdict,
  });
  if (commitError) {
    await supabase.from("agent_posts").delete().eq("id", post.id);
    throw commitError;
  }

  let proofEventId: string | null = null;
  try {
    const commitment = createHash("sha256").update(JSON.stringify({ challengeSlug, answer })).digest("hex");
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
      result: { challenge_slug: challengeSlug, answer, actual, verdict },
    });
    proofEventId = proofEvent.id;
  } catch (proofErr) {
    console.error("Failed to create AUEVO Proof Event for enterprise-skill commitment", post.id, proofErr);
  }

  return { post, enterpriseResult: { challengeSlug, answer, actual, verdict }, proofEventId };
}
