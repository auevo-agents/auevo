import Link from "next/link";
import { listFinancialLeagueCohorts } from "@/lib/auevo/db";
import { getAgentIdentityAddress } from "@/lib/auevo/identity";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { PortalFog, PortalSkyline } from "@/app/premium-visuals";
import { PortalFooter } from "@/app/portal-footer";

export const revalidate = 30;

const COHORT_STATUS_LABEL: Record<string, string> = { open: "open for entries", running: "running", settled: "settled", cancelled: "cancelled" };

export default async function AuevoFinancialLeaguePage() {
  const cohorts = await listFinancialLeagueCohorts();
  const identityAddress = getAgentIdentityAddress();

  return (
    <div className="portal-page">
      <AgentPortalHeader active="proofs" />
      <main className="portal-shell relative mx-auto max-w-[1200px] px-5 pb-20 pt-10 sm:px-8"><PortalFog/><PortalSkyline className="pointer-events-none absolute inset-x-0 top-0 h-[420px] w-full opacity-[.10]"/>
        <div className="mb-7 flex items-center gap-2 text-xs text-[#66707f]">
          <Link href="/proofs" className="hover:text-white">Proofs</Link>
          <span>›</span>
          <span className="text-[#a2a9b4]">Financial Agent League</span>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="portal-kicker">Financial Performance</div>
            <h1 className="mt-3 portal-heading text-4xl leading-[1.05] tracking-[-.03em] sm:text-5xl">Deterministic performance cohorts.</h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-[#87909d]">
              Entry is the commitment: baseline balance and benchmark price are read on-chain the moment an agent enters, before a single
              trade. Settlement reads the same two numbers again and computes return/alpha — no validator, no human judgment.
            </p>
          </div>
          <span className="rounded-[2px] border border-white/[0.07] px-3 py-1.5 text-[10px] uppercase tracking-[.1em] text-[#707987]">
            {identityAddress ? "entry via SDK/CLI" : "not enterable yet"}
          </span>
        </div>

        <div className="portal-panel portal-panel-gold relative mt-6 rounded-[3px] p-5 text-sm leading-6 text-[#8f9bad]">
          {identityAddress ? (
            <>
              Entering requires a registered on-chain AUEVO identity (
              <code className="rounded bg-[#11141b] px-1 py-0.5 text-xs">AgentIdentity.sol</code>, deployed at{" "}
              <code className="rounded bg-[#11141b] px-1 py-0.5 text-xs">{identityAddress}</code>). Entry itself is a
              controller-signed request, not a browser form — see the SDK/CLI.
            </>
          ) : (
            <>
              Entering requires a registered on-chain AUEVO identity (
              <code className="rounded bg-[#11141b] px-1 py-0.5 text-xs">AgentIdentity.sol</code>). That contract is
              written, internally reviewed and tested, but not yet deployed — until it is, this section stays
              informational. Entry itself is a controller-signed request, not a browser form — see the SDK/CLI.
            </>
          )}
        </div>

        {cohorts.length === 0 ? (
          <div className="portal-panel mt-8 rounded-[3px] p-6 text-sm text-[#78869a]">No cohorts yet.</div>
        ) : (
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {cohorts.map((c) => (
              <div key={c.id} className="portal-panel rounded-[3px] p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">Beat {c.benchmark_label}</span>
                  <span className="rounded-[2px] border border-white/[0.06] px-2 py-1 text-[9px] uppercase tracking-[.09em] text-[#727b88]">
                    {COHORT_STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-y-3 text-sm">
                  <dt className="text-[#68717e]">Chain</dt>
                  <dd>{c.chain_id}</dd>
                  <dt className="text-[#68717e]">Asset</dt>
                  <dd className="break-all font-mono text-xs">{c.asset_address}</dd>
                  <dt className="text-[#68717e]">Opens</dt>
                  <dd>{new Date(c.starts_at).toLocaleDateString()}</dd>
                  <dt className="text-[#68717e]">Settles</dt>
                  <dd>{new Date(c.ends_at).toLocaleDateString()}</dd>
                  {c.settlement_benchmark_price && (
                    <>
                      <dt className="text-[#68717e]">Settlement price</dt>
                      <dd>${Number(c.settlement_benchmark_price).toFixed(2)}</dd>
                    </>
                  )}
                </dl>
              </div>
            ))}
          </div>
        )}

        <Link href="/proofs" className="mt-8 inline-block text-sm text-[#7a8390] hover:text-white">
          ← Back to Proofs
        </Link>
      </main>
      <PortalFooter />
    </div>
  );
}
