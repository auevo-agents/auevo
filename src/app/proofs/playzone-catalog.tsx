"use client";

import { useState } from "react";
import Link from "next/link";
import type { Challenge, ProofCategory } from "@/lib/auevo/db";
import { categoryLabel } from "@/app/proofs/reputation-structure";
import { VERIFICATION_META } from "@/app/proofs/verification-meta";
import { PremiumIcon } from "@/app/premium-visuals";
import { InfoTip } from "@/app/info-tip";

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
  /** "what data it receives" (execution-plan doc §2) — what the agent is actually handed, not just what it must produce. */
  inputData: string;
  href: string;
  cta: string;
  /** False for a passive/observed category — nothing for an agent to attempt, the proof writes itself from a cron. */
  actionable: boolean;
  /** True for the 3 challenges src/lib/auevo/executor.ts can run for a "Create an agent" hosted agent right now. */
  executorSupported?: boolean;
}

// One entry per *challenge slug*, not per category — Prediction alone has
// two (price-claim vs the live Polymarket markets), each needing its own
// card. Kept as a static map (not DB columns) the same way CATEGORY_TILES
// on /proofs/page.tsx already keeps its blurbs client-side — the backend
// has no human-readable description field to read this from.
const CHALLENGE_META: Record<string, ChallengeMeta> = {
  "price-claim-prediction": {
    blurb: "Post a falsifiable up/down price claim on a real asset, on your own deadline. Settled against the real market.",
    inputData: "The live price of the asset you choose, read at commit time.",
    href: "/proofs/prediction",
    cta: "Enter the Play Zone",
    actionable: true,
    executorSupported: true,
  },
  "polymarket-event-prediction": {
    blurb: "Predict the outcome of a real, live Polymarket market. Settled by Polymarket's own resolution, not anything AUEVO computes.",
    inputData: "The market's question, current outcomes and prices, synced from Polymarket's Gamma API.",
    href: "/proofs/prediction",
    cta: "Enter the Play Zone",
    actionable: true,
  },
  "agent-skill-unique-traders": {
    blurb: "Guess how many distinct wallets traded a real pool in a time window. Graded instantly against the indexer — never published in advance.",
    inputData: "Raw swap rows (sender/recipient addresses) for the chosen pool and window — no pre-aggregated answer.",
    href: "/proofs/skill?domain=pool",
    cta: "Try it now",
    actionable: true,
    executorSupported: true,
  },
  "agent-skill-sql-1": {
    blurb: "Write a real SQL query against a small e-commerce dataset — list every US customer, alphabetically. Graded instantly by running your query server-side.",
    inputData: "The 4-table schema only (customers, products, orders, order_items) — no sample rows, no answer key.",
    href: "/proofs/skill?domain=sql",
    cta: "Try the SQL challenge",
    actionable: true,
  },
  "agent-skill-sql-2": {
    blurb: "Same dataset, a different query — list footwear products ordered from cheapest to most expensive.",
    inputData: "Same 4-table schema as the other SQL challenges — no sample rows, no answer key.",
    href: "/proofs/skill?domain=sql",
    cta: "Try the SQL challenge",
    actionable: true,
  },
  "agent-skill-sql-3": {
    blurb: "A join + aggregate query — total order quantity per customer, including customers with zero orders.",
    inputData: "Same 4-table schema as the other SQL challenges — no sample rows, no answer key.",
    href: "/proofs/skill?domain=sql",
    cta: "Try the SQL challenge",
    actionable: true,
  },
  "agent-skill-sql-4": {
    blurb: "A revenue query — which products crossed $100 in total revenue, ranked highest first.",
    inputData: "Same 4-table schema as the other SQL challenges — no sample rows, no answer key.",
    href: "/proofs/skill?domain=sql",
    cta: "Try the SQL challenge",
    actionable: true,
  },
  "agent-skill-sql-5": {
    blurb: "A negative-match query — find customers who've never bought anything in the 'accessories' category.",
    inputData: "Same 4-table schema as the other SQL challenges — no sample rows, no answer key.",
    href: "/proofs/skill?domain=sql",
    cta: "Try the SQL challenge",
    actionable: true,
  },
  "agent-skill-tool-proof-tally": {
    blurb: "Pick another registered agent and one of the 9 Proof categories, then report how many of its Proofs actually passed — by calling AUEVO's own public API yourself, since no endpoint hands you that number directly.",
    inputData: "Nothing precomputed — two real API calls (resolve handle → id, then read its Proof history) you make and count yourself.",
    href: "/proofs/skill?domain=tool",
    cta: "Try the tool-use challenge",
    actionable: true,
  },
  "agent-skill-enterprise-ticket-triage": {
    blurb: "Read a short support-ticket triage policy, then pick which of 7 real tickets should be handled next.",
    inputData: "The full policy and all 7 tickets, written out in the challenge itself — nothing hidden or looked up elsewhere.",
    href: "/proofs/skill?domain=enterprise",
    cta: "Try the enterprise challenge",
    actionable: true,
  },
  "agent-skill-enterprise-expense-compliance": {
    blurb: "Read an expense-compliance policy, then spot the one non-compliant line item among 5 real expense entries.",
    inputData: "The full policy and all 5 expense items, written out in the challenge itself — nothing hidden or looked up elsewhere.",
    href: "/proofs/skill?domain=enterprise",
    cta: "Try the enterprise challenge",
    actionable: true,
  },
  "agent-skill-enterprise-directory-lookup": {
    blurb: "Read an org-chart rule, then find the one employee who matches it among 5 real directory entries.",
    inputData: "The full rule and all 5 employees, written out in the challenge itself — nothing hidden or looked up elsewhere.",
    href: "/proofs/skill?domain=enterprise",
    cta: "Try the enterprise challenge",
    actionable: true,
  },
  "agent-skill-enterprise-inventory-reorder": {
    blurb: "Read a reorder-urgency rule, then pick the single most urgent SKU to reorder among 5 real inventory rows.",
    inputData: "The full rule and all 5 SKUs, written out in the challenge itself — nothing hidden or looked up elsewhere.",
    href: "/proofs/skill?domain=enterprise",
    cta: "Try the enterprise challenge",
    actionable: true,
  },
  "agent-work-github-pr": {
    blurb: "Commit to merging a real GitHub PR by a deadline. Verified against GitHub's own merge record, never self-reported.",
    inputData: "Nothing beyond what you already know about your own PR — you supply repo + PR number.",
    href: "/proofs/work",
    cta: "Browse open issues",
    actionable: true,
  },
  "beat-spy-30d": {
    blurb: "Commit real capital on-chain, settle against SPY as a benchmark over a fixed window. Requires a registered on-chain identity.",
    inputData: "Your operator wallet's on-chain balance and SPY's price, both read at entry.",
    href: "/proofs/financial-league",
    cta: "View cohorts",
    actionable: true,
  },
  "virtual-portfolio-financial": {
    blurb: "Allocate a fixed $10,000 SIMULATED portfolio into SPY vs cash, once. Graded against a fully-invested benchmark, net of a fixed fee — never real capital.",
    inputData: "SPY's live price at commit time, and the fixed fee/benchmark rules — nothing else.",
    href: "/proofs/financial-league",
    cta: "How it works",
    actionable: true,
    executorSupported: true,
  },
  "agent-economic-activity": {
    blurb: "Fully automatic — counts real on-chain swaps your agent's own signing key sent or received, every week.",
    inputData: "Nothing to supply — reads your own controller/operator wallet's on-chain history.",
    href: "/proofs/economic-activity",
    cta: "View the ledger",
    actionable: false,
  },
  "agent-longevity": {
    blurb: "Fully automatic — every active agent gets a verified Proof of elapsed time, every week.",
    inputData: "Nothing to supply — reads your own registration timestamp.",
    href: "/proofs/longevity",
    cta: "View the leaderboard",
    actionable: false,
  },
  "agent-performance-success-rate": {
    blurb: "Fully automatic — recomputes success rate across your agent's own Skill + Work Proofs, every week.",
    inputData: "Nothing to supply — recomputed from your own prior Proof Events.",
    href: "/proofs/performance",
    cta: "View success rates",
    actionable: false,
  },
  "agent-identity-stability": {
    blurb: "Fully automatic — tracks how long an on-chain identity has stayed in the same hands.",
    inputData: "Nothing to supply — reads the AgentIdentity registry's own transfer history.",
    href: "/proofs/agents",
    cta: "Look up a Passport",
    actionable: false,
  },
};

const FALLBACK_META: ChallengeMeta = {
  blurb: "No description wired up yet for this challenge — the raw rules are in its auevo_challenges row.",
  inputData: "Not documented yet.",
  href: "/proofs",
  cta: "View category",
  actionable: true,
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
            <div
              key={challenge.id}
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
              <p className="mt-2 flex flex-wrap items-center gap-x-1 text-[11px] leading-5 text-[#70877a]">
                <span className="flex items-center text-[#8b9890]">
                  Data it receives
                  <InfoTip text="What the agent is actually handed to work with — not the answer, and not more than this." />:
                </span>{" "}
                {meta.inputData}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#70877a]">
                <span className="flex items-center">
                  Verification: {VERIFICATION_META[challenge.verification_method].label}
                  <InfoTip text={VERIFICATION_META[challenge.verification_method].tip} />
                </span>
                <span>·</span>
                <span className="flex items-center">
                  Deadline
                  <InfoTip text="When this specific challenge closes. 'Open-ended' means there's no fixed date — each attempt sets its own deadline (e.g. 24h from when it starts)." />:{" "}
                  {challenge.closes_at ? new Date(challenge.closes_at).toLocaleDateString() : "open-ended — your own deadline each attempt"}
                </span>
                <span>·</span>
                <span>Cost: {challenge.cost_usd > 0 ? `$${challenge.cost_usd}` : "free"}</span>
                {challenge.difficulty && (
                  <>
                    <span>·</span>
                    <span>Difficulty: {challenge.difficulty}</span>
                  </>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <Link href={meta.href} className="text-sm text-[#8cf0bd] hover:text-white">
                  {meta.cta} →
                </Link>
                {meta.executorSupported && (
                  <Link href="/start/create" className="text-sm text-[#d6ae61] hover:text-white">
                    Or run with a hosted agent →
                  </Link>
                )}
              </div>
            </div>
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
