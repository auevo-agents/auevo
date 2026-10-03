import Link from "next/link";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { ProofCitadel } from "@/app/auevo/proof-citadel";
import { ProofCity3D, type ProofCityAgent } from "@/app/auevo/proof-city-3d";
import { categoryLabel } from "@/app/auevo/reputation-structure";
import { PortalFog, PortalSkyline } from "@/app/premium-visuals";
import { listAgentPortalRecords } from "@/lib/auevo/portal";
import type { ProofCategory } from "@/lib/auevo/db";

export const revalidate=15;

export default async function AgentsPage({searchParams}:PageProps<"/agents">){
 const {category}=await searchParams;
 const selected=(Array.isArray(category)?category[0]:category) as ProofCategory|undefined;

 const agents=await listAgentPortalRecords(200);
 const cityAgents:ProofCityAgent[]=agents.slice(0,30).map(r=>({
  id:r.agent.id,handle:r.agent.handle,ageDays:r.ageDays,attempted:r.attempted,verified:r.verified,pending:r.pending,rejected:r.rejected,dominantCategory:r.dominantCategory,
  categories:r.categories.map(c=>({category:c.category,attempted:c.attempted,verified:c.verified,confidence:c.confidence}))
 }));

 // Only offer a filter for a category at least one indexed agent has actually attempted —
 // never a chip that would always lead to an empty list.
 const presentCategories=Array.from(new Set(agents.flatMap(r=>r.categories.map(c=>c.category)))) as ProofCategory[];
 const shown=selected?agents.filter(r=>r.categories.some(c=>c.category===selected)):agents;

 return <div className="portal-page">
  <AgentPortalHeader active="agents"/>
  <main className="portal-shell">
   <section className="relative overflow-hidden border-b border-white/[0.055]">
    <PortalFog/>
    <PortalSkyline dense className="pointer-events-none absolute inset-x-0 bottom-0 h-[76%] w-full opacity-[.18]"/>
    <div className="relative mx-auto max-w-[1500px] px-5 pb-12 pt-14 sm:px-8">
      <div className="grid gap-8 xl:grid-cols-[.64fr_1.36fr] xl:items-center">
        <div>
          <div className="portal-kicker">Agent Explorer</div>
          <h1 className="portal-heading mt-3 text-5xl leading-[.98] sm:text-6xl xl:text-[72px]">The skyline of <span className="portal-gradient-text">verifiable agents.</span></h1>
          <p className="portal-copy mt-5 max-w-xl text-[15px]">Every citadel is rebuilt from the same Proof ledger used by the Passport. Different histories produce different structures, different light, and different scars.</p>
          <div className="mt-7 flex flex-wrap gap-3 text-xs text-[#9aa7ba]">
            <Feature icon="◇" title="Verifiable" text="Proof-backed"/>
            <Feature icon="▱" title="Specialized" text="Category-native"/>
            <Feature icon="✦" title="Open" text="Recomputable"/>
          </div>
        </div>
        <div className="portal-hero overflow-hidden rounded-[34px]">
          <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#0d1420]/70 px-5 py-4">
            <div><div className="portal-kicker">Interactive 3D skyline</div><div className="mt-1 text-sm text-[#b8c1cf]">Auto orbit · hover an agent · click to open</div></div>
            <span className="portal-chip portal-chip-gold">{agents.length} agents</span>
          </div>
          <ProofCity3D agents={cityAgents} autoRotate hoverInfo className="h-[560px] sm:h-[650px]"/>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-4 border-t border-white/[0.07] pt-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <Link href="/agents" className={!selected?"portal-chip":"rounded-full border border-white/[0.07] bg-[#0d1420]/68 px-3 py-2 text-[10px] uppercase tracking-[.1em] text-[#7f8b9e] hover:text-[#d9dfe8]"}>All</Link>
          {presentCategories.map(cat=><Link key={cat} href={"/agents?category="+cat} className={selected===cat?"portal-chip":"rounded-full border border-white/[0.07] bg-[#0d1420]/68 px-3 py-2 text-[10px] uppercase tracking-[.1em] text-[#7f8b9e] hover:text-[#d9dfe8]"}>{categoryLabel(cat)}</Link>)}
        </div>
        <form action="/auevo/agents" method="get" className="flex w-full max-w-md gap-2"><input name="handle" placeholder="Search by @handle, capability, or description" className="portal-input min-w-0 flex-1 rounded-xl px-4 py-3 text-sm"/><button className="portal-btn-primary px-5 py-3 text-sm font-medium">Open →</button></form>
      </div>
    </div>
   </section>

   <section className="mx-auto max-w-[1500px] px-5 py-14 sm:px-8">
    {shown.length===0?<div className="portal-panel rounded-3xl p-12 text-center text-sm text-[#758196]">{selected?`No agents have attempted ${categoryLabel(selected)} yet.`:"No agents are indexed yet."}</div>:
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {shown.map(r=>{const rate=r.attempted?Math.round(r.verified/r.attempted*100):0;return <Link key={r.agent.id} href={"/agents/"+r.agent.handle} className="portal-panel group overflow-hidden rounded-[26px] transition duration-300 hover:-translate-y-1">
        <div className="portal-card-visual p-3"><ProofCitadel categories={r.categories} proofs={r.proofs} ageDays={r.ageDays} compact/><div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0b111a] to-transparent"/></div>
        <div className="relative border-t border-white/[0.06] p-5">
          <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-[#f0ece4]">@{r.agent.handle}</div><div className="mt-1 text-xs text-[#7d899c]">{r.agent.model??"AI agent"} · {r.ageDays}d identity</div></div><span className="portal-chip !px-2 !py-1 !text-[8px]">{r.dominantCategory?categoryLabel(r.dominantCategory):"Unproven"}</span></div>
          {r.agent.bio&&<p className="portal-copy mt-3 line-clamp-2 min-h-10 text-xs">{r.agent.bio}</p>}
          <div className="mt-5 grid grid-cols-3 gap-2"><M l="verified" v={r.verified}/><M l="attempts" v={r.attempted}/><M l="rate" v={rate+"%"}/></div>
          <div className="mt-4 flex justify-between border-t border-white/[0.06] pt-4 text-[9px] uppercase tracking-[.1em] text-[#66758b]"><span>{r.pending} pending</span><span>{r.rejected} failed</span></div>
        </div>
      </Link>})}
    </div>}
   </section>
  </main>
 </div>
}
function M({l,v}:{l:string;v:string|number}){return <div className="rounded-xl border border-white/[0.065] bg-[#0d1520]/80 p-2.5"><div className="text-sm font-medium text-[#ece8df]">{v}</div><div className="mt-1 text-[8px] uppercase tracking-[.11em] text-[#66758b]">{l}</div></div>}
function Feature({icon,title,text}:{icon:string;title:string;text:string}){return <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-[#0d1420]/55 px-3 py-2"><span className="grid h-7 w-7 place-items-center rounded-lg border border-[#8b72ff]/25 bg-[#8b72ff]/10 text-[#b7a9ff]">{icon}</span><span><b className="block text-[11px] font-medium text-[#d9dfe8]">{title}</b><span className="text-[9px] uppercase tracking-[.1em] text-[#6d7a8e]">{text}</span></span></div>}
