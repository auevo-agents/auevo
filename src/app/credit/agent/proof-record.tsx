import Link from "next/link";
import { getPortalRecordByHandle } from "@/lib/auevo/portal";
import { categoryLabel, categoryAccent } from "@/app/proofs/reputation-structure";
import { tierOf, TIER_LABEL, type TierLevel } from "@/lib/auevo/tier";
import type { ProofCategory } from "@/lib/auevo/db";

const LIVE_CATEGORIES: ProofCategory[] = ["prediction", "work", "skill", "performance", "economic_activity", "longevity"];

function TierBar({ level }: { level: TierLevel }) {
  return (
    <div className="flex gap-1" aria-hidden>
      {[1, 2, 3].map((seg) => (
        <span key={seg} className={"h-1 w-5 rounded-[1px] " + (level >= seg ? "bg-[#42d995]" : "bg-white/[0.08]")} />
      ))}
    </div>
  );
}

/**
 * The "backer view" — the same public Proof Events a backer would read
 * before vouching for an agent, surfaced here next to the credit forms
 * instead of making them go find the Passport separately. No automated
 * gating: a human backer still decides, this just makes the record they
 * read easy to find in the one place that matters for that decision.
 */
export async function ProofRecordPanel({ handle }: { handle: string }) {
  const record = await getPortalRecordByHandle(handle);

  if (!record) {
    return (
      <div className="portal-panel rounded-[3px] p-6 text-sm text-[var(--muted)]">
        No agent registered with handle &quot;{handle}&quot;.
      </div>
    );
  }

  return (
    <div className="portal-panel rounded-[3px] p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="portal-kicker !text-[#d6ae61]">Proof record</div>
          <h2 className="mt-1.5 text-lg font-medium text-[var(--ink)]">@{record.agent.handle}</h2>
        </div>
        <Link href={`/agents/${record.agent.handle}`} className="text-xs text-[#8cf0bd] underline hover:text-white">
          Open full Passport →
        </Link>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
        What a backer reads before vouching — the same public Proof Events anyone can inspect. No hidden score; the tier bars below
        are just verified-count thresholds anyone can recompute from the raw events.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {LIVE_CATEGORIES.map((cat) => {
          const agg = record.categories.find((c) => c.category === cat);
          const verified = agg?.verified ?? 0;
          const attempted = agg?.attempted ?? 0;
          const level = agg ? tierOf(agg) : 0;
          return (
            <div key={cat} className="rounded-[3px] border border-white/[0.06] bg-white/[0.015] p-3.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: categoryAccent(cat) }} />
                <span className="flex-1 text-[#aebdb4]">{categoryLabel(cat)}</span>
                <span className="font-mono text-[#76897e]">
                  {verified}/{attempted}
                </span>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <TierBar level={level} />
                <span className="text-[9px] uppercase tracking-[.1em] text-[#6b7481]">{TIER_LABEL[level]}</span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] leading-5 text-[#6b7481]">
        AUEVO&apos;s Proof Events and the credit pool&apos;s identity registry are still separate namespaces by design (see{" "}
        <code className="rounded bg-white/[0.04] px-1 py-0.5">docs/CREDIT_SPEC.md §4</code>), but an agent can now bridge the two by
        registering a credit agent id and linking it to this handle (see{" "}
        <a href="/credit" className="underline hover:text-white">
          /credit
        </a>
        ). If this agent already did, its credit record is resolved automatically below — otherwise enter a raw id if you have one.
      </p>
    </div>
  );
}
