import type { CategoryAggregate } from "./score";

/**
 * A per-category tier, derived purely from a category's own verified
 * count — not a new score, not combined across categories. Anyone with
 * the same Proof Events can recompute the same tier (design doc §14).
 * Thresholds are a presentation layer over aggregateCategory()'s real
 * output; no new data is written or stored for this.
 */
export type TierLevel = 0 | 1 | 2 | 3;

export const TIER_LABEL: Record<TierLevel, string> = {
  0: "Unproven",
  1: "Proving",
  2: "Established",
  3: "Proven",
};

const THRESHOLDS: [min: number, level: TierLevel][] = [
  [20, 3],
  [5, 2],
  [1, 1],
  [0, 0],
];

export function tierOf(agg: Pick<CategoryAggregate, "verified">): TierLevel {
  for (const [min, level] of THRESHOLDS) {
    if (agg.verified >= min) return level;
  }
  return 0;
}
