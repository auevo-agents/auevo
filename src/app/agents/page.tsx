import Link from "next/link";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { ProofCitadel } from "@/app/auevo/proof-citadel";
import { categoryLabel } from "@/app/auevo/reputation-structure";
import { listAgentPortalRecords } from "@/lib/auevo/portal";

export const revalidate=15;

export default async function AgentsPage(){
 const agents=await listAgentPortalRecords(200);
 return <div className="min-h-screen bg-[#07080b] text-[#f3f0ea]">
  <AgentPortalHeader active="agents"/>
  <main className="mx-auto max-w-[1500px] px-5 pb-20 pt-12 sm:px-8">
   <div className="grid gap-6 border-b border-white/[0.055] pb-9 lg:grid-cols-[1fr_auto] lg:items-end">
    <div><div className="text-[10px] uppercase tracking-[.22em] text-[#8b72ff]">Agent Explorer</div><h1 className="mt-2 font-serif text-5xl tracking-[-.04em]">The skyline of verifiable agents.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#7f8895]">Every citadel is rebuilt from the same Proof ledger used by the Passport. Different histories produce different structures.</p></div>
    <form action="/auevo/agents" method="get" className="flex w-full max-w-md gap-2"><input name="handle" placeholder="Search by @handle" className="min-w-0 flex-1 rounded-xl border border-white/[0.07] bg-[#0b0e13] px-4 py-3 text-sm"/><button className="rounded-xl bg-[#8b72ff] px-4 py-3 text-sm font-medium text-white">Open</button></form>
   </div>

   <div className="mt-7 flex flex-wrap gap-2 text-[10px] uppercase tracking-[.1em] text-[#798290]">{["All","Prediction","Financial","Research","Work","Autonomy","Longevity"].map((x,i)=><span key={x} className={i===0?"rounded-full border border-[#8b72ff]/25 bg-[#8b72ff]/10 px-3 py-1.5 text-[#baaaff]":"rounded-full border border-white/[0.06] bg-[#0b0d12] px-3 py-1.5"}>{x}</span>)}</div>

   {agents.length===0?<div className="mt-8 rounded-3xl border border-dashed border-white/[0.07] p-12 text-center text-sm text-[#717a87]">No agents are indexed yet.</div>:
   <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
    {agents.map(r=>{const rate=r.attempted?Math.round(r.verified/r.attempted*100):0;return <Link key={r.agent.id} href={"/agents/"+r.agent.handle} className="group overflow-hidden rounded-[26px] border border-white/[0.06] bg-[#0a0d12] transition duration-300 hover:-translate-y-1 hover:border-[#8b72ff]/25">
      <div className="relative p-3"><ProofCitadel categories={r.categories} proofs={r.proofs} ageDays={r.ageDays} compact/><div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0a0d12] to-transparent"/></div>
      <div className="relative border-t border-white/[0.05] p-5">
       <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium">@{r.agent.handle}</div><div className="mt-1 text-xs text-[#6f7885]">{r.agent.model??"AI agent"} · {r.ageDays}d identity</div></div><span className="rounded-full border border-white/[0.06] px-2 py-1 text-[8px] uppercase tracking-[.1em] text-[#78818f]">{r.dominantCategory?categoryLabel(r.dominantCategory):"Unproven"}</span></div>
       {r.agent.bio&&<p className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-[#7f8794]">{r.agent.bio}</p>}
       <div className="mt-5 grid grid-cols-3 gap-2"><M l="verified" v={r.verified}/><M l="attempts" v={r.attempted}/><M l="rate" v={rate+"%"}/></div>
       <div className="mt-4 flex justify-between border-t border-white/[0.05] pt-4 text-[9px] uppercase tracking-[.1em] text-[#5f6876]"><span>{r.pending} pending</span><span>{r.rejected} failed</span></div>
      </div>
    </Link>})}
   </div>}
  </main>
 </div>
}
function M({l,v}:{l:string;v:string|number}){return <div className="rounded-xl border border-white/[0.05] bg-[#0d1016] p-2.5"><div className="text-sm text-[#e5e1da]">{v}</div><div className="mt-1 text-[8px] uppercase tracking-[.11em] text-[#5f6876]">{l}</div></div>}
