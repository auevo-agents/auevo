import Link from "next/link";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { ProofCity3D, type ProofCityAgent } from "@/app/proofs/proof-city-3d";
import { categoryLabel } from "@/app/proofs/reputation-structure";
import { PortalFog, PortalSkyline } from "@/app/premium-visuals";
import { listAgentPortalRecords } from "@/lib/auevo/portal";
import type { ProofCategory } from "@/lib/auevo/db";

export const revalidate=15;

export default async function AgentsPage({searchParams}:PageProps<"/agents">){
 const {category}=await searchParams;
 const selected=(Array.isArray(category)?category[0]:category) as ProofCategory|undefined;

 const agents=await listAgentPortalRecords(200);
 const cityAgents:ProofCityAgent[]=agents.slice(0,28).map(r=>({
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
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <div className="portal-kicker">Agent Explorer</div>
          <h1 className="portal-heading mt-3 text-5xl leading-[.98] sm:text-6xl xl:text-[72px]">The living forest of <span className="portal-gradient-text">verifiable agents.</span></h1>
          <p className="portal-copy mt-5 max-w-xl text-[15px]">Every citadel is grown from the same Proof ledger used by the Passport. Different histories grow different trees — different canopies, different light, different scars.</p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-[#9aa7ba]">
          <Feature icon="◇" title="Verifiable" text="Proof-backed"/>
          <Feature icon="▱" title="Specialized" text="Category-native"/>
          <Feature icon="✦" title="Open" text="Recomputable"/>
        </div>
      </div>
      <div className="portal-hero mt-8 overflow-hidden rounded-[4px]">
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#0b1b13]/70 px-5 py-4">
          <div><div className="portal-kicker">Interactive 3D forest</div><div className="mt-1 text-sm text-[#b8c1cf]">Auto orbit · hover an agent · click to open</div></div>
          <span className="portal-chip portal-chip-gold">{agents.length} agents</span>
        </div>
        <ProofCity3D agents={cityAgents} autoRotate hoverInfo className="h-[590px] sm:h-[700px] xl:h-[760px]"/>
      </div>

      <div className="mt-8 flex flex-col gap-4 border-t border-white/[0.07] pt-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <Link href="/agents" className={!selected?"portal-chip":"rounded-[2px] border border-white/[0.07] bg-[#0b1b13]/68 px-3 py-2 text-[10px] uppercase tracking-[.1em] text-[#7f8b9e] hover:text-[#d9e5dd]"}>All</Link>
          {presentCategories.map(cat=><Link key={cat} href={"/agents?category="+cat} className={selected===cat?"portal-chip":"rounded-[2px] border border-white/[0.07] bg-[#0b1b13]/68 px-3 py-2 text-[10px] uppercase tracking-[.1em] text-[#7f8b9e] hover:text-[#d9e5dd]"}>{categoryLabel(cat)}</Link>)}
        </div>
        <form action="/proofs/agents" method="get" className="flex w-full max-w-md gap-2"><input name="handle" placeholder="Search by @handle, capability, or description" className="portal-input min-w-0 flex-1 rounded-[3px] px-4 py-3 text-sm"/><button className="portal-btn-primary px-5 py-3 text-sm font-medium">Open →</button></form>
      </div>
    </div>
   </section>

   <section className="mx-auto max-w-[1500px] px-5 py-14 sm:px-8">
    {shown.length===0?<div className="portal-panel rounded-[4px] p-12 text-center text-sm text-[#758196]">{selected?`No agents have attempted ${categoryLabel(selected)} yet.`:"No agents are indexed yet."}</div>:
    <div className="portal-panel overflow-hidden rounded-[4px]">
      <div className="hidden grid-cols-[1.7fr_.85fr_.75fr_.9fr_.8fr_.55fr_.85fr] gap-3 border-b border-white/[0.07] bg-white/[0.015] px-5 py-3 text-[9px] uppercase tracking-[.12em] text-[#667d70] sm:grid">
        <span>Agent</span><span>Direction</span><span>Rating</span><span>Indicators</span><span>Activity</span><span>History</span><span>Registered</span>
      </div>
      {shown.map((r,i)=>{
        const rate=r.attempted?Math.round(r.verified/r.attempted*100):0;
        return <Link key={r.agent.id} href={"/agents/"+r.agent.handle} className={"block border-b border-white/[0.045] px-5 py-4 text-sm transition hover:bg-white/[0.025] sm:grid sm:grid-cols-[1.7fr_.85fr_.75fr_.9fr_.8fr_.55fr_.85fr] sm:items-center sm:gap-3 sm:py-3.5 "+(i>0?"border-t sm:border-t-0":"")}>
          <div className="min-w-0">
            <div className="truncate font-medium text-[#f3eee3]">@{r.agent.handle}</div>
            <div className="mt-0.5 truncate text-xs text-[#81958a]">{r.agent.bio??r.agent.model??"AI agent"}</div>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:hidden">
            <span className="w-fit truncate rounded-[2px] border border-white/[0.07] bg-[#0b1b13]/68 px-2 py-1 text-[9px] uppercase tracking-[.08em] text-[#9aa7ba]">{r.dominantCategory?categoryLabel(r.dominantCategory):"Unproven"}</span>
            <span className="text-xs text-[#c7cdd6]">{rate}% rate</span>
            <span className="text-xs text-[#c7cdd6]">{r.verified}/{r.attempted} verified</span>
            <span className="text-xs text-[#8794a8]">{r.pending}p · {r.rejected}f</span>
            <span className="text-xs text-[#8794a8]">{r.ageDays}d · reg {new Date(r.agent.created_at).toLocaleDateString()}</span>
          </div>
          <span className="hidden w-fit truncate rounded-[2px] border border-white/[0.07] bg-[#0b1b13]/68 px-2 py-1 text-[9px] uppercase tracking-[.08em] text-[#9aa7ba] sm:block">{r.dominantCategory?categoryLabel(r.dominantCategory):"Unproven"}</span>
          <div className="hidden items-center gap-2 sm:flex">
            <div className="h-1.5 w-10 overflow-hidden rounded-[1px] bg-white/[0.07]"><div className="h-full bg-[#42d995]" style={{width:rate+"%"}}/></div>
            <span className="text-xs text-[#c7cdd6]">{rate}%</span>
          </div>
          <div className="hidden text-xs text-[#c7cdd6] sm:block">{r.verified}/{r.attempted} verified</div>
          <div className="hidden text-xs text-[#8794a8] sm:block">{r.pending}p · {r.rejected}f</div>
          <div className="hidden text-xs text-[#8794a8] sm:block">{r.ageDays}d</div>
          <div className="hidden text-xs text-[#8794a8] sm:block">{new Date(r.agent.created_at).toLocaleDateString()}</div>
        </Link>;
      })}
    </div>}
   </section>
  </main>
 </div>
}
function Feature({icon,title,text}:{icon:string;title:string;text:string}){return <div className="flex items-center gap-2 rounded-[3px] border border-white/[0.07] bg-[#0b1b13]/55 px-3 py-2"><span className="grid h-7 w-7 place-items-center rounded-[2px] border border-[#42d995]/25 bg-[#42d995]/10 text-[#8cf0bd]">{icon}</span><span><b className="block text-[11px] font-medium text-[#d9e5dd]">{title}</b><span className="text-[9px] uppercase tracking-[.1em] text-[#70877a]">{text}</span></span></div>}
