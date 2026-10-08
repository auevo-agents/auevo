import { SETTLED_STATUSES, type ProofEvent, type ProofCategory, type VerificationMethod } from "./db";

/**
 * Pure aggregation over an agent's own Proof Event corpus — recomputable
 * by anyone who has the same Proofs (design doc §14: "no hidden inputs").
 * Deliberately produces no single overall score; callers render one
 * CategoryAggregate per category, never a combined number.
 */

export type EvidenceConfidence =
  | "DETERMINISTICALLY_VERIFIED"
  | "MULTI_VALIDATOR_VERIFIED"
  | "ORACLE_VERIFIED"
  | "COUNTERPARTY_CONFIRMED"
  | "SELF_REPORTED"
  | "INSUFFICIENT";

const CONFIDENCE_BY_METHOD: Record<VerificationMethod, EvidenceConfidence> = {
  deterministic: "DETERMINISTICALLY_VERIFIED",
  multi_validator: "MULTI_VALIDATOR_VERIFIED",
  oracle: "ORACLE_VERIFIED",
  self_reported: "SELF_REPORTED",
};

export interface CategoryAggregate {
  category: ProofCategory;
  attempted: number;
  /** Count of proofs that settled as an actual PASS — the success numerator shown everywhere as "verified" / the success rate. Never includes a failed attempt, however "verified" (checked) its failure was. */
  verified: number;
  confidence: EvidenceConfidence;
  /** median/best/worst of the named numeric result field, over every SETTLED proof (passed or failed) — a failed attempt still carries a real, honest result and hiding it would be cherry-picking. Null if nothing has settled. */
  resultField: string | null;
  median: number | null;
  best: number | null;
  worst: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * `resultField` names the numeric field inside each Proof's `result`
 * jsonb to aggregate (e.g. "alpha_pct" for Financial Performance). A
 * category with no single obvious numeric headline (e.g. Identity,
 * Longevity) should pass null and read `attempted`/`verified` alone.
 */
export function aggregateCategory(proofs: ProofEvent[], category: ProofCategory, resultField: string | null): CategoryAggregate {
  const inCategory = proofs.filter((p) => p.category === category);
  // Settled either way (passed or failed). Used for confidence and for the
  // numeric median/best/worst spread below — never for the "verified"
  // success count returned at the bottom, which must mean an actual pass.
  // Unresolved (scheduled/running/awaiting_settlement) and non-terminal
  // (inconclusive/cancelled) Proofs don't count toward either.
  const settledProofs = inCategory.filter((p) => (SETTLED_STATUSES as string[]).includes(p.status));

  // Confidence reflects the WEAKEST verification method among settled
  // proofs — a category is never shown as more trustworthy than its
  // least-trustworthy contributing Proof, pass or fail.
  const rank: EvidenceConfidence[] = [
    "SELF_REPORTED",
    "COUNTERPARTY_CONFIRMED",
    "MULTI_VALIDATOR_VERIFIED",
    "ORACLE_VERIFIED",
    "DETERMINISTICALLY_VERIFIED",
  ];
  let confidence: EvidenceConfidence = "INSUFFICIENT";
  for (const p of settledProofs) {
    const c = CONFIDENCE_BY_METHOD[p.verification_method];
    if (confidence === "INSUFFICIENT" || rank.indexOf(c) < rank.indexOf(confidence)) confidence = c;
  }

  let med: number | null = null;
  let best: number | null = null;
  let worst: number | null = null;
  if (resultField && settledProofs.length > 0) {
    const values = settledProofs
      .map((p) => p.result?.[resultField])
      .filter((v): v is number => typeof v === "number");
    if (values.length > 0) {
      med = median(values);
      best = Math.max(...values);
      worst = Math.min(...values);
    }
  }

  return {
    category,
    attempted: inCategory.length,
    verified: inCategory.filter((p) => p.status === "passed").length,
    confidence,
    resultField,
    median: med,
    best,
    worst,
  };
}

/** Headline numeric field per category, where one obviously applies — used by the Passport. */
export const CATEGORY_RESULT_FIELD: Partial<Record<ProofCategory, string>> = {
  financial_performance: "alpha_pct",
  prediction: "error_pct",
  longevity: "days_active",
  economic_activity: "tx_count",
  skill: "error_pct",
  performance: "success_rate",
};

export interface SkillSubDomain {
  key: "sql" | "tool" | "enterprise" | "pool";
  label: string;
  attempted: number;
  verified: number;
}

const SKILL_SUBDOMAIN_LABEL: Record<SkillSubDomain["key"], string> = {
  sql: "SQL",
  tool: "Tool use",
  enterprise: "Enterprise",
  pool: "Pool trader-count",
};

function skillSubDomainKey(p: ProofEvent): SkillSubDomain["key"] {
  const slug = typeof p.result?.challenge_slug === "string" ? p.result.challenge_slug : "";
  if (slug.startsWith("agent-skill-sql")) return "sql";
  if (slug.startsWith("agent-skill-enterprise")) return "enterprise";
  if (typeof p.result?.target_category === "string") return "tool";
  return "pool";
}

/**
 * Skill is one ProofCategory but four independently-gradable domains (SQL,
 * tool-use, enterprise, the original pool-trader-count challenge) — a
 * single blended "Skill: X/Y" hides which specific ability an agent is
 * actually strong or weak at. Breaks a Skill agent's own Proofs out by
 * domain, inferred from the shape of each Proof's own `result` (no new
 * data, no new field needed on the event itself).
 */
export function skillSubDomains(proofs: ProofEvent[]): SkillSubDomain[] {
  const byKey = new Map<SkillSubDomain["key"], ProofEvent[]>();
  for (const p of proofs) {
    if (p.category !== "skill") continue;
    const key = skillSubDomainKey(p);
    const group = byKey.get(key) ?? [];
    group.push(p);
    byKey.set(key, group);
  }
  return (["sql", "tool", "enterprise", "pool"] as const)
    .map((key) => {
      const group = byKey.get(key) ?? [];
      return { key, label: SKILL_SUBDOMAIN_LABEL[key], attempted: group.length, verified: group.filter((p) => p.status === "passed").length };
    })
    .filter((d) => d.attempted > 0);
}
