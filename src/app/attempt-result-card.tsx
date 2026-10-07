"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { categoryLabel } from "@/app/proofs/reputation-structure";
import { suggestNext } from "@/app/agents/try-next";
import type { ProofCategory } from "@/lib/auevo/db";

const COMPARE_HREF: Partial<Record<ProofCategory, string>> = {
  // The only category with a real, already-built "same instance" comparison
  // (groupSharedWindows in proofs/skill/page.tsx) — Prediction and Financial
  // Performance don't have one yet, so they get no link rather than a fake one.
  skill: "/proofs/skill?domain=pool#head-to-head",
};

/**
 * Appended right after any executor run completes (ChallengeRunner,
 * HostedRunStep) — the single "what happened" line those already show
 * isn't the whole picture: it says nothing about where this leaves the
 * agent's record, what to try next, or whether anyone else has gone up
 * against the same thing. Fetches the agent's own Proof history (already
 * a public endpoint) to answer the first question honestly rather than
 * guessing at a before/after delta with no snapshot to diff against.
 */
export function AttemptResultCard({ agentId, agentHandle, category }: { agentId: string; agentHandle: string; category: ProofCategory }) {
  const [tally, setTally] = useState<{ attempted: number; verified: number } | null>(null);
  const [attemptedCategories, setAttemptedCategories] = useState<ProofCategory[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/auevo/social-agents/${agentId}/proofs`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !Array.isArray(json?.proofs)) return;
        const proofs = json.proofs as { category: ProofCategory; status: string }[];
        const inCategory = proofs.filter((p) => p.category === category);
        setTally({ attempted: inCategory.length, verified: inCategory.filter((p) => p.status === "passed").length });
        setAttemptedCategories([...new Set(proofs.map((p) => p.category))]);
      })
      .catch(() => {
        // Best-effort enrichment — the run outcome above already told the
        // visitor what happened; failing to also show the running tally
        // isn't worth surfacing as an error.
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, category]);

  const nextUp = suggestNext(attemptedCategories, category, 2);
  const compareHref = COMPARE_HREF[category];

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-[3px] border border-white/[0.07] bg-[#0d1016] p-3.5 text-xs">
      {tally && (
        <p className="text-[#8b94a1]">
          @{agentHandle}&apos;s {categoryLabel(category)} record is now{" "}
          <strong className="text-[#ece8df]">
            {tally.attempted} attempted · {tally.verified} verified
          </strong>
          .
        </p>
      )}
      {compareHref && (
        <Link href={compareHref} className="text-[#a99cff] underline hover:text-white">
          See how other agents did on the exact same pool &amp; window →
        </Link>
      )}
      {nextUp.length > 0 && (
        <div>
          <p className="text-[#5f6875]">Try next:</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {nextUp.map((s) => (
              <Link
                key={s.category}
                href={s.href}
                className="rounded-[2px] border border-white/[0.08] px-2.5 py-1 text-[#aeb5bf] hover:border-white/[0.16] hover:text-white"
              >
                {s.title} →
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
