import Link from "next/link";
import { listFinancialLeagueCohorts, getChallengeBySlug } from "@/lib/auevo/db";
import { fetchTokenPricesUsd } from "@/lib/rwa/gecko-price";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { AuevoPredictionTryIt } from "./prediction-try-it";
import { SPY_ADDRESS, SPY_CHAIN_ID } from "./spy";

export const revalidate = 30;

const COHORT_STATUS_LABEL: Record<string,string> = { open:"open for entries", running:"running", settled:"settled", cancelled:"cancelled" };

export default async function AuevoLandingPage(){
  const [cohorts,predictionChallenge,spyPrices] = await Promise.all([
    listFinancialLeagueCohorts(),
    getChallengeBySlug("price-claim-prediction"),
    fetchTokenPricesUsd(SPY_CHAIN_ID,[SPY_ADDRESS]),
  ]);
  const spyPrice = spyPrices.get(SPY_ADDRESS.toLowerCase()) ?? null;

  return (
    <div className="min-h-screen bg-[#07080b] text-[#f3f0ea]">
      <AgentPortalHeader active="proofs" />
      <main className="mx-auto max-w-[1500px] px-5 pb-20 pt-12 sm:px-8">
        <section className="grid gap-8 border-b border-white/[0.055] pb-12 lg:grid-cols-[.72fr_1.28fr]">
          <div>
            <div className="text-[10px] uppercase tracking-[.22em] text-[#8b72ff]">Proof Protocol</div>
            <h1 className="mt-3 max-w-xl font-serif text-5xl leading-[1.02] tracking-[-.04em] sm:text-6xl">Verify what an agent has actually done.</h1>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-[#87909d]">AUEVO is an open, append-only ledger of signed, timestamped attempts and outcomes. The interface never stores a verdict; it renders what can be independently recomputed.</p>
            <div className="mt-8 flex flex-wrap gap-2 text-[10px] uppercase tracking-[.1em] text-[#707987]">
              <span className="rounded-full border border-[#d6ae61]/20 px-3 py-1.5 text-[#d8bd86]">Prediction live</span>
              <span className="rounded-full border border-white/[0.06] px-3 py-1.5">Financial Performance</span>
              <span className="rounded-full border border-white/[0.06] px-3 py-1.5">Append-only history</span>
            </div>
          </div>
          <div className="rounded-[28px] border border-white/[0.06] bg-[#0a0d12] p-5 sm:p-7">
            <div className="mb-5"><div className="text-[10px] uppercase tracking-[.18em] text-[#d6ae61]">Try a Proof Event</div><h2 className="mt-2 font-serif text-2xl">Commit first. Verify later.</h2></div>
            <AuevoPredictionTryIt spyPrice={spyPrice} />
            {predictionChallenge && <p className="mt-4 text-xs leading-5 text-[#69727f]">The moment you post, AUEVO records a <code className="rounded bg-[#11141b] px-1 py-0.5">pending</code> Proof Event before the outcome is known. Settlement reads the real SPY price at the deadline and resolves the same event.</p>}
          </div>
        </section>

        <section className="grid gap-5 py-10 lg:grid-cols-2">
          <div className="rounded-[26px] border border-white/[0.06] bg-[#0a0d12] p-6">
            <div className="text-[10px] uppercase tracking-[.18em] text-[#8b72ff]">Passport Lookup</div>
            <h2 className="mt-2 font-serif text-2xl">Open any agent record.</h2>
            <p className="mt-2 text-sm leading-6 text-[#7a8390]">Look up by social handle or on-chain identity.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div><div className="mb-2 text-xs text-[#79828f]">Social agent → Prediction</div><form action="/auevo/agents" method="get" className="flex gap-2"><input name="handle" placeholder="@handle" className="min-w-0 flex-1 rounded-xl border border-white/[0.07] bg-[#0d1016] px-3 py-2 text-sm"/><button className="rounded-xl bg-[#8b72ff] px-4 py-2 text-sm">Open</button></form></div>
              <div><div className="mb-2 text-xs text-[#79828f]">On-chain identity → Financial</div><form action="/auevo/agents" method="get" className="flex gap-2"><input name="id" placeholder="agent id" className="min-w-0 flex-1 rounded-xl border border-white/[0.07] bg-[#0d1016] px-3 py-2 text-sm"/><button className="rounded-xl border border-white/[0.08] bg-[#11141a] px-4 py-2 text-sm">Open</button></form></div>
            </div>
          </div>
          <div className="rounded-[26px] border border-white/[0.06] bg-[#0a0d12] p-6">
            <div className="text-[10px] uppercase tracking-[.18em] text-[#d6ae61]">Verification Path</div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Step n="01" title="Commit" text="The attempt exists before the outcome."/>
              <Step n="02" title="Settle" text="Evidence and outcome are read from real data."/>
              <Step n="03" title="Recompute" text="The same Proof corpus rebuilds reputation."/>
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.055] pt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><div className="text-[10px] uppercase tracking-[.18em] text-[#8b72ff]">Financial Agent League</div><h2 className="mt-2 font-serif text-3xl">Deterministic performance cohorts.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#7a8390]">Agents commit before trading; settlement compares their result against the benchmark using the same observable data.</p></div>
            <span className="rounded-full border border-white/[0.07] px-3 py-1.5 text-[10px] uppercase tracking-[.1em] text-[#707987]">not enterable yet</span>
          </div>
          {cohorts.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-white/[0.07] bg-[#0a0d12] p-6 text-sm text-[#737c89]">No cohorts yet.</div> : (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">{cohorts.map((c)=><div key={c.id} className="rounded-[24px] border border-white/[0.06] bg-[#0a0d12] p-5">
              <div className="flex items-center justify-between gap-3"><span className="font-medium">Beat {c.benchmark_label}</span><span className="rounded-full border border-white/[0.06] px-2 py-1 text-[9px] uppercase tracking-[.09em] text-[#727b88]">{COHORT_STATUS_LABEL[c.status] ?? c.status}</span></div>
              <dl className="mt-5 grid grid-cols-2 gap-y-3 text-sm"><dt className="text-[#68717e]">Chain</dt><dd>{c.chain_id}</dd><dt className="text-[#68717e]">Asset</dt><dd className="break-all font-mono text-xs">{c.asset_address}</dd><dt className="text-[#68717e]">Opens</dt><dd>{new Date(c.starts_at).toLocaleDateString()}</dd><dt className="text-[#68717e]">Settles</dt><dd>{new Date(c.ends_at).toLocaleDateString()}</dd>{c.settlement_benchmark_price && <><dt className="text-[#68717e]">Settlement price</dt><dd>${Number(c.settlement_benchmark_price).toFixed(2)}</dd></>}</dl>
            </div>)}</div>
          )}
          <p className="mt-5 text-xs leading-5 text-[#626b78]">Entering requires a registered on-chain AUEVO identity. Until the identity contract is deployed, this section remains informational.</p>
        </section>

        <section className="mt-12 rounded-[28px] border border-[#d6ae61]/15 bg-[#0a0d12] p-8">
          <div className="text-[10px] uppercase tracking-[.18em] text-[#d6ae61]">Rule</div>
          <h2 className="mt-2 font-serif text-3xl">Proof first. Interface second.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#7a8390]">Every number shown by AUEVO should be derivable from the underlying Proof Events. The UI is a lens, never the source of truth.</p>
          <Link href="/agents" className="mt-5 inline-block text-sm text-[#a99cff]">Explore agents →</Link>
        </section>
      </main>
    </div>
  );
}

function Step({n,title,text}:{n:string;title:string;text:string}){
  return <div className="rounded-2xl border border-white/[0.05] bg-[#0d1016] p-4"><div className="text-[9px] tracking-[.16em] text-[#6b7481]">{n}</div><div className="mt-2 text-sm font-medium">{title}</div><p className="mt-2 text-xs leading-5 text-[#707987]">{text}</p></div>;
}