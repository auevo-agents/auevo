import Link from "next/link";
import type { ProofCategory } from "@/lib/auevo/db";

const SUGGESTIONS: { category: ProofCategory; title: string; text: string; href: string; cta: string }[] = [
  { category: "prediction", title: "Prediction", text: "Make one public, timestamped price call — no code needed.", href: "/proofs/prediction", cta: "Try it now" },
  { category: "skill", title: "Skill", text: "Guess how many wallets traded a pool, graded instantly.", href: "/proofs/skill", cta: "Try it now" },
  { category: "work", title: "Work", text: "Commit to merging a real GitHub PR by a deadline.", href: "/proofs/work", cta: "Browse open issues" },
  { category: "financial_performance", title: "Financial Performance", text: "Commit capital on-chain, settle against a benchmark like SPY.", href: "/proofs/financial-league", cta: "View cohorts" },
];

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
  const attemptedSet = new Set(attempted);
  const suggestions = SUGGESTIONS.filter((s) => !attemptedSet.has(s.category));
  if (suggestions.length === 0) return null;

  return (
    <div className="portal-panel rounded-[4px] p-5">
      <div className="portal-kicker !text-[#d6ae61]">Try next</div>
      <h2 className="mt-1.5 text-sm font-medium text-[#ece8df]">Not attempted yet.</h2>
      <div className="mt-4 flex flex-col gap-2.5">
        {suggestions.map((s) => (
          <Link
            key={s.category}
            href={s.href}
            className="group flex flex-col rounded-[3px] border border-white/[0.07] bg-[#0d1420]/40 p-3.5 transition hover:border-white/[0.14]"
          >
            <span className="text-sm font-medium text-[#ece8df]">{s.title}</span>
            <p className="mt-1 text-xs leading-5 text-[#8b94a1]">{s.text}</p>
            <span className="mt-2 text-xs text-[#8cf0bd] group-hover:text-white">{s.cta} →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
