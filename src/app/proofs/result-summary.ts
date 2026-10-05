import type { ProofCategory } from "@/lib/auevo/db";

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/**
 * A one-line, human-readable gloss of what a Proof Event's `result`
 * actually says — e.g. "guessed 5, actual 5" for Skill, not just the
 * bare category name. Only the four "ability" categories (Prediction,
 * Skill, Work, Financial — execution-plan doc §3) ever have something
 * concrete to summarize here; the five "observed/summary/origin"
 * categories (Longevity, Economic Activity, Performance, Identity,
 * Autonomy) correctly return null — there's no single attempt's result
 * to gloss, only an ongoing measurement, and inventing one would blur
 * exactly the distinction that section of the doc asks to keep sharp.
 */
export function summarizeProofResult(category: ProofCategory, result: Record<string, unknown>): string | null {
  switch (category) {
    case "skill": {
      const guess = num(result.guess);
      const actual = num(result.actual);
      if (guess === null) return null;
      return actual === null ? `guessed ${guess}` : `guessed ${guess}, actual ${actual}`;
    }
    case "prediction": {
      const direction = str(result.direction);
      if (direction) {
        const target = num(result.target_price);
        return target ? `${direction} vs $${target.toFixed(2)}` : direction;
      }
      const outcome = str(result.chosen_outcome);
      return outcome ? `picked "${outcome}"` : null;
    }
    case "work": {
      const repo = str(result.repo);
      const pr = num(result.pr_number);
      return repo ? `${repo}${pr ? ` #${pr}` : ""}` : null;
    }
    case "financial_performance": {
      const alloc = num(result.allocation_pct);
      if (alloc === null) return null;
      const net = num(result.net_return_pct);
      return net === null ? `${alloc}% allocated` : `${alloc}% allocated, ${net >= 0 ? "+" : ""}${net.toFixed(1)}% net`;
    }
    default:
      return null;
  }
}
