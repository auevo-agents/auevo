import type { ProofEvent, ProofCategory, VerificationMethod } from "./db";

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
  verified: number;
  confidence: EvidenceConfidence;
  /** median/best/worst of the named numeric result field, over VERIFIED proofs only. Null if verified=0. */
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
  const verifiedProofs = inCategory.filter((p) => p.status === "verified");

  // Confidence reflects the WEAKEST verification method among verified
  // proofs — a category is never shown as more trustworthy than its
  // least-trustworthy contributing Proof.
  const rank: EvidenceConfidence[] = [
    "SELF_REPORTED",
    "COUNTERPARTY_CONFIRMED",
    "MULTI_VALIDATOR_VERIFIED",
    "ORACLE_VERIFIED",
    "DETERMINISTICALLY_VERIFIED",
  ];
  let confidence: EvidenceConfidence = "INSUFFICIENT";
  for (const p of verifiedProofs) {
    const c = CONFIDENCE_BY_METHOD[p.verification_method];
    if (confidence === "INSUFFICIENT" || rank.indexOf(c) < rank.indexOf(confidence)) confidence = c;
  }

  let med: number | null = null;
  let best: number | null = null;
  let worst: number | null = null;
  if (resultField && verifiedProofs.length > 0) {
    const values = verifiedProofs
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
    verified: verifiedProofs.length,
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
};
