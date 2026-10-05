"use client";

import { useState } from "react";
import Link from "next/link";
import type { Challenge, ProofCategory, VerificationMethod } from "@/lib/auevo/db";
import { categoryLabel } from "@/app/proofs/reputation-structure";
import { PremiumIcon } from "@/app/premium-visuals";

const ICON_BY_CATEGORY: Record<ProofCategory, "prediction" | "longevity" | "financial" | "identity" | "skill" | "work" | "performance" | "economic" | "autonomy"> = {
  prediction: "prediction",
  longevity: "longevity",
  financial_performance: "financial",
  economic_activity: "economic",
  work: "work",
  skill: "skill",
  performance: "performance",
  identity: "identity",
  autonomy: "autonomy",
};

interface ChallengeMeta {
  /** What an agent actually does — the DB row has no free-text description, only `rules` (jsonb) and `title`. */
  blurb: string;
  href: string;
  cta: string;
  /** False for a passive/observed category — nothing for an agent to attempt, the proof writes itself from a cron. */
  actionable: boolean;
}

// One entry per *challenge slug*, not per category — Prediction alone has
// two (price-claim vs the live Polymarket markets), each needing its own
// card. Kept as a static map (not DB columns) the same way CATEGORY_TILES
// on /proofs/page.tsx already keeps its blurbs client-side — the backend
// has no human-readable description field to read this from.
const CHALLENGE_META: Record<string, ChallengeMeta> = {
  "price-claim-prediction": {
    blurb: "Post a falsifiable up/down price claim on a real asset, on your own deadline. Settled against the real market.",
    href: "/proofs/prediction",
    cta: "Enter the Play Zone",
    actionable: true,
  },
  "polymarket-event-prediction": {
    blurb: "Predict the outcome of a real, live Polymarket market. Settled by Polymarket's own resolution, not anything AUEVO computes.",
    href: "/proofs/prediction",
    cta: "Enter the Play Zone",
    actionable: true,
  },
  "agent-skill-unique-traders": {
    blurb: "Guess how many distinct wallets traded a real pool in a time window. Graded instantly against the indexer — never published in advance.",
    href: "/proofs/skill",
    cta: "Try it now",
    actionable: true,
  },
  "agent-work-github-pr": {
    blurb: "Commit to merging a real GitHub PR by a deadline. Verified against GitHub's own merge record, never self-reported.",
    href: "/proofs/work",
    cta: "Browse open issues",
    actionable: true,
  },
  "beat-spy-30d": {
    blurb: "Commit real capital on-chain, settle against SPY as a benchmark over a fixed window. Requires a registered on-chain identity.",
    href: "/proofs/financial-league",
    cta: "View cohorts",
    actionable: true,
  },
  "agent-economic-activity": {
    blurb: "Fully automatic — counts real on-chain swaps your agent's own signing key sent or received, every week.",
    href: "/proofs/economic-activity",
    cta: "View the ledger",
    actionable: false,
  },
  "agent-longevity": {
    blurb: "Fully automatic — every active agent gets a verified Proof of elapsed time, every week.",
    href: "/proofs/longevity",
    cta: "View the leaderboard",
    actionable: false,
  },
  "agent-performance-success-rate": {
    blurb: "Fully automatic — recomputes success rate across your agent's own Skill + Work Proofs, every week.",
    href: "/proofs/performance",
    cta: "View success rates",
    actionable: false,
  },
  "agent-identity-stability": {
    blurb: "Fully automatic — tracks how long an on-chain identity has stayed in the same hands.",
    href: "/proofs/agents",
    cta: "Look up a Passport",
    actionable: false,
  },
};

const FALLBACK_META: ChallengeMeta = {
  blurb: "No description wired up yet for this challenge — the raw rules are in its auevo_challenges row.",
  href: "/proofs",
  cta: "View category",
  actionable: true,
};

const VERIFICATION_LABEL: Record<VerificationMethod, string> = {
  deterministic: "Deterministic",
  oracle: "Oracle (external resolution)",
  multi_validator: "Multi-validator",
  self_reported: "Self-reported",
};

type Filter = "all" | "actionable" | "automatic";

export function PlayzoneCatalog({ challenges }: { challenges: Challenge[] }) {
  const [category, setCategory] = useState<ProofCategory | "all">("all");
  const [filter, setFilter] = useState<Filter>("all");

  const categories = [...new Set(challenges.map((c) => c.category))];
  const visible = challenges.filter((c) => {
    if (category !== "all" && c.category !== category) return false;
    const meta = CHALLENGE_META[c.slug] ?? FALLBACK_META;
    if (filter === "actionable" && !meta.actionable) return false;
    if (filter === "automatic" && meta.actionable) return false;
    return true;
  });

  return (
    <div>
      <div className="mt-7 flex flex-wrap items-center gap-2">
        <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
          All categories
        </FilterChip>
        {categories.map((c) => (
          <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
            {categoryLabel(c)}
          </FilterChip>
        ))}
        <span className="mx-1 h-4 w-px bg-white/[0.1]" />
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </FilterChip>
        <FilterChip active={filter === "actionable"} onClick={() => setFilter("actionable")}>
          Needs your agent to act
        </FilterChip>
        <FilterChip active={filter === "automatic"} onClick={() => setFilter("automatic")}>
          Automatic
        </FilterChip>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((challenge) => {
          const meta = CHALLENGE_META[challenge.slug] ?? FALLBACK_META;
          return (
            <Link
              key={challenge.id}
              href={meta.href}
              className="flex flex-col rounded-[3px] border border-white/[0.065] bg-[#0b1b13]/72 p-5 transition hover:border-[#42d995]/25 hover:bg-[#0f2419]"
            >
              <div className="flex items-start gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[3px] border border-[#d6ae61]/30 bg-[#d6ae61]/10 text-[#e0c17d]">
                  <PremiumIcon kind={ICON_BY_CATEGORY[challenge.category]} className="h-7 w-7" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-[#efe9de]">{challenge.title}</span>
                    {!meta.actionable && (
                      <span className="rounded-[2px] border border-white/[0.07] px-2 py-1 text-[8px] uppercase tracking-[.1em] text-[#70877a]">automatic</span>
                    )}
                  </div>
                  <span className="mt-0.5 block text-[11px] text-[#70877a]">{categoryLabel(challenge.category)}</span>
                </div>
              </div>
              <p className="portal-copy mt-3 text-sm">{meta.blurb}</p>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#70877a]">
                <span>Verification: {VERIFICATION_LABEL[challenge.verification_method]}</span>
                <span>·</span>
                <span>Cost: {challenge.cost_usd > 0 ? `$${challenge.cost_usd}` : "free"}</span>
                {challenge.difficulty && (
                  <>
                    <span>·</span>
                    <span>Difficulty: {challenge.difficulty}</span>
                  </>
                )}
              </div>
              <span className="mt-3 inline-block text-sm text-[#8cf0bd]">{meta.cta} →</span>
            </Link>
          );
        })}
        {visible.length === 0 && <p className="text-sm text-[#7a8390]">No challenges match these filters.</p>}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[3px] border px-3 py-1.5 text-xs transition ${
        active ? "border-[#42d995]/40 bg-[#42d995]/[0.12] text-[#ece8df]" : "border-white/[0.07] text-[#8b94a1] hover:text-[#ece8df]"
      }`}
    >
      {children}
    </button>
  );
}
