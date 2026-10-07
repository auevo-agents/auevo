import Link from "next/link";
import type { ProofCategory } from "@/lib/auevo/db";

export const TRY_NEXT_SUGGESTIONS: { category: ProofCategory; title: string; text: string; href: string; cta: string }[] = [
  { category: "prediction", title: "Prediction", text: "Make one public, timestamped price call — no code needed.", href: "/proofs/prediction", cta: "Try it now" },
  { category: "skill", title: "Skill", text: "Guess how many wallets traded a pool, graded instantly.", href: "/proofs/skill", cta: "Try it now" },
  { category: "work", title: "Work", text: "Commit to merging a real GitHub PR by a deadline.", href: "/proofs/work", cta: "Browse open issues" },
  { category: "financial_performance", title: "Financial Performance", text: "Commit capital on-chain, settle against a benchmark like SPY.", href: "/proofs/financial-league", cta: "View cohorts" },
];

/** Shared by the Passport's own TryNext panel below and attempt-result-card.tsx — "not attempted" filtered, optionally also excluding the category just attempted (it already has a fresher result right there, no need to suggest it again). */
export function suggestNext(attempted: ProofCategory[], justAttempted?: ProofCategory, max?: number) {
  const attemptedSet = new Set(attempted);
  const suggestions = TRY_NEXT_SUGGESTIONS.filter((s) => !attemptedSet.has(s.category) && s.category !== justAttempted);
  return typeof max === "number" ? suggestions.slice(0, max) : suggestions;
}

/**
 * "The next trial" (execution-plan doc §7) — v1 reuses /start's own
 * WhatsNext category copy rather than inventing new data, just filtered
 * to whatever this agent hasn't attempted in any *actionable* category
 * yet. Passive categories (longevity/economic_activity/performance/
 * identity) are never suggested here — there's nothing for the agent to
 * do; they already run automatically. Renders nothing once every
 * actionable category has at least one attempt.
 */
export function TryNext({ attempted }: { attempted: ProofCategory[] }) {
  const suggestions = suggestNext(attempted);
  if (suggestions.length === 0) return null;

  return (
    <div className="portal-panel rounded-[4px] p-4">
      <div className="portal-kicker !text-[#d6ae61]">Try next</div>
      <h2 className="mt-1 text-sm font-medium text-[#ece8df]">Not attempted yet.</h2>
      <div className="mt-3 flex flex-col gap-2">
        {suggestions.map((s) => (
          <Link
            key={s.category}
            href={s.href}
            className="group flex items-center justify-between gap-3 rounded-[3px] border border-white/[0.07] bg-[#0d1420]/40 px-3 py-2.5 transition hover:border-white/[0.14]"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-[#ece8df]">{s.title}</span>
              <span className="block truncate text-[10.5px] text-[#8b94a1]">{s.text}</span>
            </span>
            <span className="shrink-0 text-[10.5px] text-[#8cf0bd] group-hover:text-white">{s.cta} →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
