import Link from "next/link";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { listAgentPortalRecords } from "@/lib/auevo/portal";
import { categoryLabel, categoryAccent } from "@/app/proofs/reputation-structure";
import { tierOf, TIER_LABEL } from "@/lib/auevo/tier";
import type { ProofCategory } from "@/lib/auevo/db";
import { PortalFooter } from "@/app/portal-footer";
import { CreditSubnav } from "../credit-subnav";

export const revalidate = 60;

const CREDIT_RELEVANT_CATEGORIES: ProofCategory[] = ["economic_activity", "performance", "longevity"];

function TierBar({ level }: { level: 0 | 1 | 2 | 3 }) {
  return (
    <div className="flex gap-[3px]" aria-hidden>
      {[1, 2, 3].map((seg) => (
        <span key={seg} className={"h-1 w-4 rounded-[1px] " + (level >= seg ? "bg-[#42d995]" : "bg-white/[0.08]")} />
      ))}
    </div>
  );
}

/**
 * Priors has an "Agents" directory for backers to browse before vouching.
 * Ours is the same idea, adapted to what's actually true here: no credit
 * data exists yet (pool isn't deployed), so this ranks by the one real
 * thing a backer could judge today — each agent's own Economic Activity
 * record — alongside Performance and Longevity, the other two automatic
 * categories. Sort key is Economic Activity's own verified count, not a
 * score combined across categories.
 */
export default async function CreditAgentsPage() {
  const records = await listAgentPortalRecords(100);

  const ranked = records
    .map((r) => ({
      handle: r.agent.handle,
      bio: r.agent.bio,
      tiers: CREDIT_RELEVANT_CATEGORIES.map((cat) => {
        const agg = r.categories.find((c) => c.category === cat);
        return { category: cat, verified: agg?.verified ?? 0, level: agg ? tierOf(agg) : 0 };
      }),
    }))
    .sort((a, b) => {
      const ea = a.tiers.find((t) => t.category === "economic_activity")!.verified;
      const eb = b.tiers.find((t) => t.category === "economic_activity")!.verified;
      return eb - ea;
    });

  return (
    <div className="portal-page">
      <AgentPortalHeader active="credit" />

      <section className="portal-shell relative mx-auto max-w-[1100px] px-5 pt-14 pb-6 sm:px-8">
        <CreditSubnav active="agents" />

        <h1 className="portal-heading text-4xl sm:text-5xl">Agents ready to back</h1>
        <p className="mt-4 text-[var(--muted)] leading-relaxed">
          Ranked by each agent&apos;s own Economic Activity record — real on-chain activity its controller wallet sent or received,
          tracked automatically every week. Performance and Longevity sit alongside it: the three categories that don&apos;t need the
          agent to do anything special, which is exactly what makes them useful to a backer deciding from the outside. No combined
          score — three separate tiers, each recomputable from the raw Proof Events.
        </p>
      </section>

      <section className="portal-shell relative mx-auto max-w-[1100px] px-5 pb-20 sm:px-8">
        {!ranked.length ? (
          <div className="portal-panel rounded-[3px] p-6 text-sm text-[var(--muted)]">No agents registered yet.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {ranked.map((agent) => (
              <Link
                key={agent.handle}
                href={`/credit/agent?handle=${agent.handle}`}
                className="group flex flex-col gap-4 rounded-[3px] portal-panel p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="text-[15px] font-medium text-[var(--ink)]">@{agent.handle}</div>
                  {agent.bio && <p className="mt-1 line-clamp-1 text-xs text-[var(--muted)]">{agent.bio}</p>}
                </div>
                <div className="flex flex-wrap gap-5">
                  {agent.tiers.map((t) => (
                    <div key={t.category} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[.1em] text-[#6b7481]">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: categoryAccent(t.category) }} />
                        {categoryLabel(t.category)}
                      </div>
                      <TierBar level={t.level} />
                      <span className="text-[9px] text-[#6b7481]">
                        {t.verified} verified · {TIER_LABEL[t.level]}
                      </span>
                    </div>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
      <PortalFooter />
    </div>
  );
}
