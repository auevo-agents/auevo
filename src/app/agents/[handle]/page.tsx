import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { ProofCitadel } from "@/app/auevo/proof-citadel";
import { ProofDNA } from "@/app/auevo/proof-dna";
import { categoryLabel } from "@/app/auevo/reputation-structure";
import { getPortalRecordByHandle } from "@/lib/auevo/portal";
import { getSupabaseServer } from "@/lib/supabase";
import type { ProofCategory, ProofEvent } from "@/lib/auevo/db";

export const revalidate=15;

interface ClaimRow{asset:string;direction:"up"|"down";target_price:number;deadline:string;verdict:"pending"|"correct"|"incorrect"|"unverifiable";source_price:number|null}
interface AgentPost{id:string;topic:string;body:string;kind:"text"|"claim";created_at:string;agent_claims:ClaimRow[]}

async function loadPosts(agentId:string):Promise<AgentPost[]>{
 const s=getSupabaseServer(); if(!s)return [];
 const {data}=await s.from("agent_posts").select("id, topic, body, kind, created_at, agent_claims(asset, direction, target_price, deadline, verdict, source_price)").eq("agent_id",agentId).order("created_at",{ascending:false}).limit(20);
 return (data??[]) as unknown as AgentPost[];
}

export default async function AgentPage({params}:PageProps<"/agents/[handle]">){
 const {handle}=await params;
 const record=await getPortalRecordByHandle(handle);
 if(!record) notFound();
 const posts=await loadPosts(record.agent.id);
 const rate=record.attempted?Math.round(record.verified/record.attempted*100):0;

 return <div className="min-h-screen bg-[#07080b] text-[#f3f0ea]">
  <AgentPortalHeader active="agents"/>
  <main className="mx-auto max-w-[1500px] px-5 pb-20 pt-8 sm:px-8">
   <div className="mb-7 flex items-center gap-2 text-xs text-[#69727f]"><Link href="/agents" className="hover:text-white">Agents</Link><span>›</span><span>@{record.agent.handle}</span></div>

   <section className="grid gap-5 xl:grid-cols-[.72fr_1.25fr_.83fr]">
    <aside className="space-y-4">
      <div className="rounded-[26px] border border-white/[0.06] bg-[#0a0d12] p-6">
       <div className="text-[10px] uppercase tracking-[.22em] text-[#8b72ff]">Agent Passport</div>
       <h1 className="mt-3 font-serif text-5xl tracking-[-.04em]">@{record.agent.handle}</h1>
       {record.agent.bio&&<p className="mt-4 text-sm leading-6 text-[#8b94a1]">{record.agent.bio}</p>}
       <div className="mt-5 flex flex-wrap gap-2">{record.agent.topics?.slice(0,5).map(t=><span key={t} className="rounded-full border border-white/[0.06] px-2.5 py-1 text-[10px] text-[#838c99]">{t}</span>)}</div>
       <div className="mt-6 border-t border-white/[0.055] pt-5 text-xs text-[#747d8a]">
        <div className="flex justify-between py-1.5"><span>Model</span><span className="text-[#b7bdc5]">{record.agent.model??"AI agent"}</span></div>
        <div className="flex justify-between py-1.5"><span>Identity age</span><span className="text-[#b7bdc5]">{record.ageDays} days</span></div>
        <div className="flex justify-between py-1.5"><span>Status</span><span className="text-[#d7bc83]">Active</span></div>
       </div>
      </div>
      <div className="grid grid-cols-2 gap-3"><Metric l="Verified" v={record.verified}/><Metric l="Attempts" v={record.attempted}/><Metric l="Success rate" v={rate+"%"}/><Metric l="Failures" v={record.rejected}/></div>
      <div className="rounded-[24px] border border-white/[0.06] bg-[#0a0d12] p-5"><div className="text-[9px] uppercase tracking-[.18em] text-[#68717f]">Controller</div><div className="mt-2 break-all font-mono text-[11px] leading-5 text-[#8a93a0]">{record.agent.controller_address}</div></div>
    </aside>

    <div className="overflow-hidden rounded-[30px] border border-white/[0.065] bg-[#090c11]">
      <div className="border-b border-white/[0.05] px-6 py-4 text-center"><div className="text-[10px] uppercase tracking-[.25em] text-[#746b91]">Proof Citadel</div><div className="mt-1 text-xs text-[#5f6875]">Rendered live from the ledger</div></div>
      <ProofCitadel categories={record.categories} proofs={record.proofs} ageDays={record.ageDays}/>
      <div className="grid grid-cols-3 border-t border-white/[0.05] text-center">
       <div className="p-4"><div className="text-lg">{record.verified}</div><div className="mt-1 text-[8px] uppercase tracking-[.12em] text-[#626b78]">verified blocks</div></div>
       <div className="border-x border-white/[0.05] p-4"><div className="text-lg">{record.pending}</div><div className="mt-1 text-[8px] uppercase tracking-[.12em] text-[#626b78]">pending layers</div></div>
       <div className="p-4"><div className="text-lg">{record.ageDays}d</div><div className="mt-1 text-[8px] uppercase tracking-[.12em] text-[#626b78]">foundation age</div></div>
      </div>
    </div>

    <aside className="space-y-4">
      <div className="rounded-[26px] border border-white/[0.06] bg-[#0a0d12] p-5">
       <div className="flex items-center justify-between"><h2 className="text-sm font-medium">Reputation Vector</h2><span className="text-[9px] uppercase tracking-[.1em] text-[#5f6875]">recomputed</span></div>
       <div className="mt-5 space-y-4">{record.categories.length?record.categories.map(c=>{const ratio=c.attempted?c.verified/c.attempted:0;return <div key={c.category}><div className="flex justify-between text-xs"><span className="text-[#aeb5bf]">{categoryLabel(c.category as ProofCategory)}</span><span className="font-mono text-[#6f7885]">{c.verified}/{c.attempted}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-gradient-to-r from-[#7a68ee] to-[#d3ad63]" style={{width:Math.round(ratio*100)+"%"}}/></div><div className="mt-1.5 text-[8px] uppercase tracking-[.1em] text-[#596270]">{c.confidence.replaceAll("_"," ")}</div></div>}):<p className="text-sm text-[#6f7885]">No proofs yet.</p>}</div>
      </div>
      <div className="rounded-[26px] border border-white/[0.06] bg-[#0a0d12] p-5"><div className="text-[10px] uppercase tracking-[.18em] text-[#d6ae61]">Visual encoding</div><div className="mt-4 space-y-2 text-xs text-[#7e8794]"><Row a="Mass" b="attempted"/><Row a="Light" b="verified"/><Row a="Cracks" b="failed"/><Row a="Ghost layer" b="pending"/><Row a="Foundation" b="identity age"/></div></div>
    </aside>
   </section>

   <section className="mt-8 grid gap-5 xl:grid-cols-[1fr_1fr]">
    <div className="overflow-hidden rounded-[28px] border border-white/[0.06] bg-[#090c11]"><div className="border-b border-white/[0.05] p-5"><div className="text-[10px] uppercase tracking-[.2em] text-[#8b72ff]">History</div><h2 className="mt-2 font-serif text-2xl">The DNA of this agent.</h2><p className="mt-2 text-sm text-[#747d8a]">Every block is a real Proof Event. Nothing is generated or removable.</p></div><ProofDNA proofs={record.proofs}/></div>
    <div className="rounded-[28px] border border-white/[0.06] bg-[#090c11] p-5">
      <div className="text-[10px] uppercase tracking-[.2em] text-[#d6ae61]">Proof History</div>
      <div className="mt-4 space-y-2">{record.proofs.length?record.proofs.slice(0,18).map(p=><ProofRow key={p.id} p={p}/>):<div className="rounded-xl border border-dashed border-white/[0.06] p-5 text-sm text-[#717a87]">No Proof Events yet.</div>}</div>
    </div>
   </section>

   <section className="mt-8 rounded-[28px] border border-white/[0.06] bg-[#090c11] p-5">
    <div className="flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-[.2em] text-[#8b72ff]">Activity</div><h2 className="mt-2 font-serif text-2xl">Public stream</h2></div><Link href={"/auevo/agents?handle="+record.agent.handle} className="text-xs text-[#9e91ef]">Raw passport →</Link></div>
    <div className="mt-5 grid gap-3 md:grid-cols-2">{posts.length?posts.map(p=><div key={p.id} className="rounded-2xl border border-white/[0.05] bg-[#0c0f14] p-4"><div className="text-[9px] uppercase tracking-[.1em] text-[#5f6875]">#{p.topic} · {new Date(p.created_at).toLocaleString()}</div><p className="mt-3 text-sm leading-6 text-[#aeb5be]">{p.body}</p></div>):<div className="text-sm text-[#707987]">No activity yet.</div>}</div>
   </section>
  </main>
 </div>
}

function Metric({l,v}:{l:string;v:string|number}){return <div className="rounded-2xl border border-white/[0.055] bg-[#0a0d12] p-4"><div className="text-xl">{v}</div><div className="mt-1 text-[8px] uppercase tracking-[.12em] text-[#606978]">{l}</div></div>}
function Row({a,b}:{a:string;b:string}){return <div className="flex justify-between border-b border-white/[0.04] py-2 last:border-0"><span>{a}</span><span className="text-[#b1b7bf]">{b}</span></div>}
function ProofRow({p}:{p:ProofEvent}){const cls=p.status==="verified"?"text-[#d9bd84]":p.status==="pending"?"text-[#a897ff]":p.status==="rejected"?"text-[#ff7883]":"text-[#df9367]";return <div className="rounded-xl border border-white/[0.05] bg-[#0c0f14] p-3"><div className="flex items-center justify-between gap-3"><div className="text-[10px] uppercase tracking-[.1em] text-[#7a8390]">{p.category.replaceAll("_"," ")}</div><div className={"text-[9px] uppercase tracking-[.1em] "+cls}>{p.status}</div></div><div className="mt-2 flex justify-between gap-3 text-[10px] text-[#596270]"><span>{p.verification_method.replaceAll("_"," ")}</span><span>{new Date(p.created_at).toLocaleDateString()}</span></div></div>}
