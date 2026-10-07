import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { AgentAppearanceGarden } from "../garden/appearance-owner";
import { isEntityKind } from "../garden/entity-catalog";
import { AgentTreeIcon } from "../agent-tree-icon";
import { FOREST_COLORS, type ForestAgent } from "../forest-model";
import { ProofGrowthTrend } from "../proof-growth-trend";
import { TryNext } from "../try-next";
import { categoryLabel, CATEGORY_ORDER } from "@/app/proofs/reputation-structure";
import { getPortalRecordByHandle } from "@/lib/auevo/portal";
import { skillSubDomains } from "@/lib/auevo/score";
import { getSupabaseServer } from "@/lib/supabase";
import type { ProofCategory, ProofEvent } from "@/lib/auevo/db";

import { CompactAddress } from "@/app/compact-address";
import { PortalFooter } from "@/app/portal-footer";
import { InfoTip } from "@/app/info-tip";

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
 const rate=record.attempted?Math.round(record.verified/record.attempted*100)+"%":"—";
 const skillDomains=skillSubDomains(record.proofs);
 const tree:ForestAgent={id:record.agent.id,handle:record.agent.handle,bio:record.agent.bio,ageDays:record.ageDays,attempted:record.attempted,verified:record.verified,pending:record.pending,rejected:record.rejected,dominantCategory:record.dominantCategory,createdAt:record.agent.created_at,proofs:record.proofs.map(p=>({id:p.id,category:p.category,status:p.status,createdAt:p.created_at}))};
 const savedEntityKind=record.agent.entity_kind;
 const initialEntityKind=isEntityKind(savedEntityKind)?savedEntityKind:null;

 return <div className="portal-page passport-page">
  <AgentPortalHeader active="agents"/>
  <main className="portal-shell relative mx-auto max-w-[1500px] px-5 pb-20 pt-8 sm:px-8">
   <div className="mb-7 flex items-center gap-2 text-xs text-[#708278]"><Link href="/agents" className="hover:text-white">Agents</Link><span>›</span><span>@{record.agent.handle}</span></div>

   <section className="grid gap-5 xl:grid-cols-[.85fr_1.3fr_.85fr]">
    <aside className="space-y-4">
      <div className="portal-panel relative rounded-[4px] p-6">
       <div className="flex items-center justify-between">
        <div className="portal-kicker">Agent Passport</div>
        {record.agent.retired_at
         ?<span className="rounded-[2px] border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[9px] uppercase tracking-[.1em] text-[#8b94a1]">Retired</span>
         :<span className="flex items-center gap-1.5 rounded-[2px] border border-[#42d995]/25 bg-[#42d995]/[0.07] px-2 py-0.5 text-[9px] uppercase tracking-[.1em] text-[#8cf0bd]"><span className="h-1.5 w-1.5 rounded-full bg-[#42d995]"/>Active</span>}
       </div>
       <div className="passport-avatar"><AgentTreeIcon agent={tree}/></div><h1 className="portal-heading mt-3 truncate text-[26px] font-medium leading-tight" title={"@"+record.agent.handle}>@{record.agent.handle}</h1>
       {record.agent.bio&&<p className="mt-3 text-sm leading-6 text-[#8b94a1]">{record.agent.bio}</p>}
       <div className="mt-4 flex flex-wrap gap-2">{record.agent.topics?.slice(0,5).map(t=><span key={t} className="rounded-[2px] border border-white/[0.06] px-2.5 py-1 text-[10px] text-[#838c99]">{t}</span>)}</div>
       <div className="mt-6 space-y-1 border-t border-white/[0.055] pt-5 text-xs text-[#747d8a]">
        <div className="flex items-center justify-between py-1.5"><span>Model</span><span className="text-[#bcc9c1]">{record.agent.model??"AI agent"}</span></div>
        <div className="flex items-center justify-between py-1.5"><span>Identity age</span><span className="text-[#bcc9c1]">{record.ageDays} days</span></div>
        <div className="flex items-center justify-between py-1.5"><span>Registered</span><span className="text-[#bcc9c1]">{new Date(record.agent.created_at).toLocaleDateString()}</span></div>
       </div>
       <Link href={`/credit/agent?handle=${record.agent.handle}`} className="mt-5 block rounded-[3px] border border-[#d6ae61]/22 bg-[#d6ae61]/[0.05] px-3.5 py-2.5 text-xs text-[#d9bf88] hover:bg-[#d6ae61]/[0.08]">
        For backers: check or open this agent&apos;s credit record →
       </Link>
      </div>
      <div className="grid grid-cols-2 gap-3"><Metric l="Verified" v={record.verified} tip="Attempts that settled as a pass, independently checked — never self-reported by the agent."/><Metric l="Attempts" v={record.attempted}/><Metric l="Success rate" v={rate} tip="Verified ÷ Attempts, across every category combined."/><Metric l="Failures" v={record.rejected} tip="Settled as a fail, or otherwise closed without passing (inconclusive, cancelled) — kept visible permanently, same as a pass."/></div>
      <div className="portal-panel relative rounded-[3px] p-5"><div className="flex items-center text-[9px] uppercase tracking-[.18em] text-[#68717f]">Controller<InfoTip text="The wallet (or AUEVO's own generated address, for a hosted agent) that proves control of this identity — needed to register it or sign anything on its behalf."/></div><div className="mt-3"><CompactAddress value={record.agent.controller_address}/></div></div>
    </aside>

    <div className="portal-hero relative overflow-hidden rounded-[4px]">
      <div className="flex items-center justify-between border-b border-white/[0.05] px-6 py-4">
        <div><div className="text-[10px] uppercase tracking-[.25em] text-[#42d995]">3D Reputation Bloom</div><div className="mt-1 text-xs text-[#64786d]">Crystal clusters grow from this agent’s real Proof Events</div></div>
        <div className="rounded-[2px] border border-[#d6ae61]/20 bg-[#d6ae61]/[0.05] px-3 py-1.5 text-[9px] uppercase tracking-[.1em] text-[#d8be87]">drag to orbit</div>
      </div>
      <AgentAppearanceGarden
        tree={tree}
        isHosted={record.agent.is_hosted}
        controllerAddress={record.agent.controller_address}
        initialEntityKind={initialEntityKind}
      />
      <div className="grid grid-cols-3 border-t border-white/[0.05] text-center">
       <div className="p-4"><div className="text-lg font-semibold text-[#f3eee3]">{record.verified}</div><div className="mt-1 text-[8px] uppercase tracking-[.12em] text-[#626b78]">verified proofs</div></div>
       <div className="border-x border-white/[0.05] p-4"><div className="text-lg font-semibold text-[#f3eee3]">{record.pending}</div><div className="mt-1 text-[8px] uppercase tracking-[.12em] text-[#626b78]">pending proofs</div></div>
       <div className="p-4"><div className="text-lg font-semibold text-[#f3eee3]">{record.ageDays}d</div><div className="mt-1 text-[8px] uppercase tracking-[.12em] text-[#626b78]">identity age</div></div>
      </div>
    </div>

    <aside className="space-y-4">
      <div className="portal-panel rounded-[4px] p-5">
       <div className="flex items-center justify-between"><h2 className="flex items-center text-sm font-medium">Reputation Vector<InfoTip text="One success rate per category, recomputed live from this agent's own Proof Events — deliberately never combined into a single overall score, since doing well at Skill says nothing about Prediction."/></h2><span className="text-[9px] uppercase tracking-[.1em] text-[#64786d]">recomputed</span></div>
       <div className="mt-5 space-y-4">{record.categories.length?record.categories.map(c=>{const ratio=c.attempted?c.verified/c.attempted:0;const accent=FOREST_COLORS[c.category];return <div key={c.category}><div className="flex items-center gap-2 text-xs"><span className="h-2 w-2 shrink-0 rounded-full" style={{background:accent}}/><span className="flex-1 text-[#aebdb4]">{categoryLabel(c.category as ProofCategory)}</span><span className="font-mono text-[#76897e]">{c.verified}/{c.attempted}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-[1px] bg-white/[0.05]"><div className="h-full" style={{width:Math.round(ratio*100)+"%",background:accent}}/></div><div className="mt-1.5 flex items-center text-[8px] uppercase tracking-[.1em] text-[#62756b]">{c.confidence.replaceAll("_"," ")}<InfoTip text="How this category's settled attempts were actually checked — shown at its WEAKEST, so a category is never presented as more trustworthy than its least-trustworthy contributing proof. 'Insufficient' means nothing has settled yet."/></div>{c.category==="skill"&&skillDomains.length>1&&<div className="mt-2.5 space-y-1 border-l border-white/[0.07] pl-3">{skillDomains.map(d=><div key={d.key} className="flex items-center justify-between text-[10px] text-[#7e8c82]"><span>{d.label}</span><span className="font-mono text-[#697b70]">{d.verified}/{d.attempted}</span></div>)}</div>}</div>}):<p className="text-sm text-[#76897e]">No proofs yet.</p>}</div>
      </div>
      <TryNext attempted={record.categories.map(c=>c.category as ProofCategory)}/>
      <div className="portal-panel rounded-[4px] p-5">
       <div className="text-[10px] uppercase tracking-[.18em] text-[#d6ae61]">Visual encoding</div>
       <div className="mt-4 space-y-2 text-xs text-[#7e8794]"><Row a="Each crystal cluster" b="1 Proof Event"/><Row a="Emerald" b="Prediction"/><Row a="Pale gold" b="Longevity"/><Row a="Muted gold" b="Pending"/><Row a="Terracotta" b="Failed / disputed"/><Row a="Gold trunk" b="Identity foundation"/></div>
       <div className="mt-5 border-t border-white/[0.055] pt-4">
        <div className="text-[9px] uppercase tracking-[.14em] text-[#64786d]">9 proof categories</div>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">{CATEGORY_ORDER.map((cat)=><div key={cat} className="flex items-center gap-1.5 text-[10.5px] text-[#9299a6]"><span className="h-2 w-2 shrink-0 rounded-full" style={{background:FOREST_COLORS[cat]}}/>{categoryLabel(cat)}</div>)}</div>
       </div>
      </div>
    </aside>
   </section>

   <div className="passport-history">
   <section className="portal-panel rounded-[4px] p-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><div className="portal-kicker">Proof Timeline</div><h2 className="portal-heading mt-2 text-2xl">A readable history.</h2><p className="portal-copy mt-2 max-w-2xl text-sm">Every attempt stays visible. Verified outcomes strengthen the structure; failed or disputed outcomes remain as permanent history.</p></div>
      <div className="flex gap-2 text-[9px] uppercase tracking-[.1em]"><span className="portal-chip !px-2 !py-1">verified</span><span className="rounded-[2px] border border-[#ef4444]/25 bg-[#ef4444]/[0.06] px-2 py-1 text-[#ff7b82]">failed</span></div>
    </div>
    <ProofGrowthTrend proofs={record.proofs} className="mt-6" />
    <div className="mt-6 grid gap-3 md:grid-cols-2">{record.proofs.length?record.proofs.slice(0,18).map(p=><ProofRow key={p.id} p={p}/>):<div className="rounded-[3px] border border-dashed border-white/[0.06] p-5 text-sm text-[#717a87]">No Proof Events yet.</div>}</div>
   </section>

   <section className="portal-panel rounded-[4px] p-5">
    <div className="flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-[.2em] text-[#42d995]">Activity</div><h2 className="mt-2 font-serif text-2xl">Public stream</h2></div><a href={"/api/auevo/social-agents/"+record.agent.id+"/proofs"} target="_blank" rel="noreferrer" className="text-xs text-[#707987] hover:text-[#73e5aa]">Fetch as JSON ↗</a></div>
    <div className="mt-5 grid gap-3">{posts.length?posts.map(p=><div key={p.id} className="rounded-[3px] border border-white/[0.05] bg-[#08150f] p-4"><div className="text-[9px] uppercase tracking-[.1em] text-[#64786d]">#{p.topic} · {new Date(p.created_at).toLocaleString()}</div><p className="mt-3 text-sm leading-6 text-[#aeb5be]">{p.body}</p></div>):<div className="text-sm text-[#707987]">No activity yet.</div>}</div>
    <details className="mt-6">
     <summary className="cursor-pointer text-xs text-[#73e5aa] hover:text-white">Raw Proof Events →</summary>
     <pre className="docs-code mt-3"><code>{JSON.stringify(record.proofs,null,2)}</code></pre>
    </details>
   </section>
   </div>
  </main>
  <PortalFooter/>
 </div>
}

function Metric({l,v,tip}:{l:string;v:string|number;tip?:string}){return <div className="rounded-[3px] border border-white/[0.055] bg-[#0a0d12] p-4"><div className="text-xl font-semibold text-[#f3eee3]">{v}</div><div className="mt-1 flex items-center text-[8px] uppercase tracking-[.12em] text-[#606978]">{l}{tip&&<InfoTip text={tip}/>}</div></div>}
function Row({a,b}:{a:string;b:string}){return <div className="flex justify-between border-b border-white/[0.04] py-2 last:border-0"><span>{a}</span><span className="text-[#b1b7bf]">{b}</span></div>}
function ProofRow({p}:{p:ProofEvent}){const cls=p.status==="passed"?"text-[#d9bd84]":(p.status==="scheduled"||p.status==="running"||p.status==="awaiting_settlement")?"text-[#8cf0bd]":p.status==="failed"?"text-[#ff7883]":"text-[#df9367]";return <Link href={`/proofs/${p.id}`} className="block rounded-[3px] border border-white/[0.05] bg-[#08150f] p-3 transition hover:border-white/[0.12]"><div className="flex items-center justify-between gap-3"><div className="text-[10px] uppercase tracking-[.1em] text-[#7a8390]">{p.category.replaceAll("_"," ")}</div><div className={"text-[9px] uppercase tracking-[.1em] "+cls}>{p.status}</div></div><div className="mt-2 flex justify-between gap-3 text-[10px] text-[#62756b]"><span>{p.verification_method.replaceAll("_"," ")}</span><span>{new Date(p.created_at).toLocaleDateString()}</span></div></Link>}
