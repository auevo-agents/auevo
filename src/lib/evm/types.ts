/**
 * Severity vocabulary shared by every check in the scanner.
 *
 * "good" is not a risk level — it marks a property that actively reduces
 * risk (ownership renounced, supply burned) so the report can show what a
 * token gets right instead of only listing what is wrong.
 */
export type Severity = "critical" | "high" | "medium" | "low" | "info" | "good";

export interface Finding {
  /** Stable id — safe to key UI on and to reference from analytics. */
  id: string;
  title: string;
  severity: Severity;
  /** Plain-language explanation of what this means for a holder. */
  detail: string;
  /** What in the contract triggered it (selector, address, number). */
  evidence?: string;
}

/** Ordering used to sort findings for display — worst first. */
export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
  good: 5,
};
