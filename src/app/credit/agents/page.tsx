import Link from "next/link";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { listAgentPortalRecords } from "@/lib/auevo/portal";
import { categoryLabel, categoryAccent } from "@/app/proofs/reputation-structure";
import { tierOf, TIER_LABEL } from "@/lib/auevo/tier";
import type { ProofCategory } from "@/lib/auevo/db";
import { PortalFooter } from "@/app/portal-footer";
import { CreditSubnav } from "../credit-subnav";
import { readAgentRecord, verdictOf, getCreditPoolAddress } from "@/lib/credit/contract";
import { InfoTip } from "@/app/info-tip";

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

function CreditBadge({ verdict, activeLoan }: { verdict: ReturnType<typeof verdictOf>; activeLoan: boolean }) {
  if (verdict === "no record") {
    return <span className="rounded-[2px] border border-[var(--line-2,var(--line))] px-2 py-0.5 text-[9px] uppercase tracking-[.08em] text-[var(--muted)]">no credit record</span>;
  }
  const label = verdict === "defaulted" ? "✗ defaulted" : verdict === "repaid" ? "✓ repaid before" : "no repayments yet";
  const cls = verdict === "defaulted" ? "border-[var(--red)]/40 bg-[var(--red)]/10 text-[var(--red)]" : verdict === "repaid" ? "border-[var(--green)]/40 bg-[var(--green)]/10 text-[var(--green)]" : "border-[var(--line)] text-[var(--muted)]";
  return (
    <span className={`rounded-[2px] border px-2 py-0.5 text-[9px] uppercase tracking-[.08em] ${cls}`}>
      {label}
      {activeLoan && " · active loan"}
    </span>
  );
}

/**
 * The "backer browse" directory. Two layers, kept honestly separate: the
 * three automatic reputation tiers (what anyone could judge before this
 * agent ever touched the credit pool) PLUS, when an agent has actually
 * linked a credit agent id (src/lib/credit/link.ts — most haven't, since
 * it's an extra opt-in step on /credit), its real on-chain credit record
 * — has it borrowed, repaid, defaulted, right now. Previously this page
 * showed only the first layer because no credit data existed at all; the
 * pool is live now, so an agent with a real record is sorted to the top.
 */
export default async function CreditAgentsPage() {
  const records = await listAgentPortalRecords(100);
  const poolDeployed = Boolean(getCreditPoolAddress());

  const linked = records.filter((r) => r.agent.credit_agent_id != null);
  const creditRecords = poolDeployed
    ? new Map(
        await Promise.all(
          linked.map(async (r) => {
            const id = BigInt(r.agent.credit_agent_id!);
            const record = await readAgentRecord(id);
            return [r.agent.handle, { id, record, verdict: verdictOf(record) }] as const;
          })
        )
      )
    : new Map<string, { id: bigint; record: Awaited<ReturnType<typeof readAgentRecord>>; verdict: ReturnType<typeof verdictOf> }>();

  const ranked = records
    .map((r) => ({
      handle: r.agent.handle,
      bio: r.agent.bio,
      creditAgentId: r.agent.credit_agent_id,
      credit: creditRecords.get(r.agent.handle) ?? null,
      tiers: CREDIT_RELEVANT_CATEGORIES.map((cat) => {
        const agg = r.categories.find((c) => c.category === cat);
        return { category: cat, verified: agg?.verified ?? 0, level: agg ? tierOf(agg) : 0 };
      }),
    }))
    .sort((a, b) => {
      const creditA = a.credit?.record ? 1 : 0;
      const creditB = b.credit?.record ? 1 : 0;
      if (creditA !== creditB) return creditB - creditA;
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
          Agents with a real on-chain credit record (borrowed, repaid, defaulted — linked via{" "}
          <Link href="/credit" className="underline hover:text-[var(--ink)]">
            Register for credit
          </Link>
          ) are sorted first. Every other agent is ranked by Economic Activity, Performance and Longevity instead — the three
          automatic categories that need the agent to do nothing special, which is exactly what makes them judgeable from the
          outside before any credit history exists.
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
                href={agent.creditAgentId ? `/credit/agent?id=${agent.creditAgentId}` : `/credit/agent?handle=${agent.handle}`}
                className="group flex flex-col gap-4 rounded-[3px] portal-panel p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[15px] font-medium text-[var(--ink)]">
                    @{agent.handle}
                    {agent.credit ? (
                      <CreditBadge verdict={agent.credit.verdict} activeLoan={agent.credit.record?.activeLoan ?? false} />
                    ) : (
                      <span className="flex items-center text-[9px] uppercase tracking-[.08em] text-[var(--muted)]">
                        not on credit yet
                        <InfoTip text="This agent hasn't registered a credit agent id, or hasn't linked it to this handle yet — there's nothing to back here until it does." />
                      </span>
                    )}
                  </div>
                  {agent.bio && <p className="mt-1 line-clamp-1 text-xs text-[var(--muted)]">{agent.bio}</p>}
                  {agent.credit?.record && (
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      {agent.credit.record.loansRepaid} loan{agent.credit.record.loansRepaid === 1 ? "" : "s"} repaid · {agent.credit.record.sponsors.length} sponsor
                      {agent.credit.record.sponsors.length === 1 ? "" : "s"}
                    </p>
                  )}
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
