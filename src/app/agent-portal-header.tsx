"use client";

import { AuevoLogo } from "@/app/auevo-logo";
import Link from "next/link";
import { useState } from "react";

function UniverseIcon(){return <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none"><circle cx="10" cy="10" r="2.2" fill="currentColor"/><ellipse cx="10" cy="10" rx="7.2" ry="3.8" stroke="currentColor" strokeWidth="1.1"/><ellipse cx="10" cy="10" rx="3.8" ry="7.2" stroke="currentColor" strokeWidth="1.1" opacity=".65"/></svg>}
function AgentsIcon(){return <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="7" cy="7" r="2.4"/><circle cx="13.3" cy="8.2" r="2"/><path d="M2.8 16c.4-3 2.1-4.5 4.4-4.5s4 1.5 4.4 4.5M11.5 12.7c2.9-.3 4.8 1 5.2 3.3"/></svg>}
function CreditIcon(){return <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="2.5" y="5" width="15" height="10" rx="1.2"/><path d="M2.5 8.2h15"/><path d="M5 11.6h3"/></svg>}
function ProofIcon(){return <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M6 2.8h6l3 3v11.4H6z"/><path d="M12 2.8v3h3M8.3 10.2l1.2 1.2 2.6-2.8"/></svg>}
function MenuIcon({open}:{open:boolean}){return open
  ? <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>
  : <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 5.5h14M3 10h14M3 14.5h14"/></svg>}

/**
 * Main portal nav — covers the agent-reputation/credit side of the site
 * (/, /agents, /credit/*, /proofs/*, /start, the legal pages). RWA has
 * its own separate trading-app chrome (rwa/app/sidebar.tsx + a landing
 * nav on /rwa itself) and is deliberately NOT duplicated up here — this
 * header links to it only from PortalFooter, one level down, rather than
 * competing for primary-row space with the agent/credit features that
 * are this site's actual front door.
 */
export function AgentPortalHeader({ active }: { active?: "home" | "agents" | "credit" | "proofs" | "start" | "devlog" }) {
  const [open, setOpen] = useState(false);
  const item=(href:string,label:string,key:"home"|"agents"|"credit"|"proofs",icon:React.ReactNode)=>(
    <Link href={href} aria-current={active===key ? "page" : undefined} className={`flex items-center gap-2 rounded-[2px] px-4 py-2 transition ${active===key?"bg-[#10261a] text-[#f4f0e8] shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]":"text-[#81958a] hover:bg-white/[0.025] hover:text-[#f4f0e8]"}`}>{icon}{label}</Link>
  );
  const mobileItem=(href:string,label:string,key:"home"|"agents"|"credit"|"proofs",icon:React.ReactNode)=>(
    <Link href={href} onClick={()=>setOpen(false)} className={`flex items-center gap-3 rounded-[2px] px-4 py-3 text-sm transition ${active===key?"bg-[#10261a] text-[#f4f0e8]":"text-[#a7b9ae] hover:bg-white/[0.035] hover:text-white"}`}>{icon}{label}</Link>
  );
  return (
    <header className="auevo-portal-header sticky top-0 z-50 border-b border-white/[0.055] bg-[#06100c]/94 px-5 backdrop-blur-2xl sm:px-8">
      <div className="mx-auto flex h-[72px] max-w-[1500px] items-center justify-between gap-6">
        <Link href="/" className="flex items-center">
          <AuevoLogo className="portal-logo" />
        </Link>

        <nav className="portal-primary-nav hidden items-center gap-1 rounded-[3px] border border-[#6fa789]/[0.13] bg-[#09170f] p-1 text-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,.02)] md:flex">
          {item("/","Universe","home",<UniverseIcon/>)}
          {item("/agents","Agents","agents",<AgentsIcon/>)}
          {item("/credit","Credit","credit",<CreditIcon/>)}
          <div className="group relative">
            <Link href="/proofs" aria-current={active==="proofs" ? "page" : undefined} className={`flex items-center gap-2 rounded-[2px] px-4 py-2 transition ${active==="proofs"?"bg-[#10261a] text-[#f4f0e8] shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]":"text-[#81958a] hover:bg-white/[0.025] hover:text-[#f4f0e8]"}`}>
              <ProofIcon/>Proofs
              <svg width="9" height="9" viewBox="0 0 9 9" className="opacity-50"><path d="M1 3l3.5 3L8 3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/></svg>
            </Link>
            <div className="invisible absolute left-0 top-full pt-3 opacity-0 transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              <div className="w-60 rounded-[3px] border border-[#6fa789]/[0.14] bg-[#08150f]/98 p-2 shadow-[0_26px_70px_rgba(0,0,0,.45)] backdrop-blur-xl">
                <Link href="/proofs" className="block rounded-[2px] px-3 py-2.5 text-[#a7b9ae] hover:bg-white/[0.035] hover:text-white">Proof overview</Link>
                <Link href="/proofs/playzone" className="flex items-center justify-between rounded-[2px] px-3 py-2.5 text-[#a7b9ae] hover:bg-white/[0.035] hover:text-white"><span>Playzone</span><span className="rounded-[2px] border border-[#d6ae61]/20 bg-[#d6ae61]/[0.04] px-2 py-0.5 text-[8px] uppercase tracking-[.1em] text-[#d7bd87]">live</span></Link>
                <Link href="/proofs/prediction" className="flex items-center justify-between rounded-[2px] px-3 py-2.5 text-[#a7b9ae] hover:bg-white/[0.035] hover:text-white"><span>Prediction</span><span className="rounded-[2px] border border-[#d6ae61]/20 bg-[#d6ae61]/[0.04] px-2 py-0.5 text-[8px] uppercase tracking-[.1em] text-[#d7bd87]">live</span></Link>
                <Link href="/proofs/longevity" className="flex items-center justify-between rounded-[2px] px-3 py-2.5 text-[#a7b9ae] hover:bg-white/[0.035] hover:text-white"><span>Longevity</span><span className="rounded-[2px] border border-[#d6ae61]/20 bg-[#d6ae61]/[0.04] px-2 py-0.5 text-[8px] uppercase tracking-[.1em] text-[#d7bd87]">live</span></Link>
                <Link href="/proofs/economic-activity" className="flex items-center justify-between rounded-[2px] px-3 py-2.5 text-[#a7b9ae] hover:bg-white/[0.035] hover:text-white"><span>Economic Activity</span><span className="rounded-[2px] border border-[#d6ae61]/20 bg-[#d6ae61]/[0.04] px-2 py-0.5 text-[8px] uppercase tracking-[.1em] text-[#d7bd87]">live</span></Link>
                <Link href="/proofs/work" className="flex items-center justify-between rounded-[2px] px-3 py-2.5 text-[#a7b9ae] hover:bg-white/[0.035] hover:text-white"><span>Work</span><span className="rounded-[2px] border border-[#d6ae61]/20 bg-[#d6ae61]/[0.04] px-2 py-0.5 text-[8px] uppercase tracking-[.1em] text-[#d7bd87]">live</span></Link>
                <Link href="/proofs/skill" className="flex items-center justify-between rounded-[2px] px-3 py-2.5 text-[#a7b9ae] hover:bg-white/[0.035] hover:text-white"><span>Skill</span><span className="rounded-[2px] border border-[#d6ae61]/20 bg-[#d6ae61]/[0.04] px-2 py-0.5 text-[8px] uppercase tracking-[.1em] text-[#d7bd87]">live</span></Link>
                <Link href="/proofs/performance" className="flex items-center justify-between rounded-[2px] px-3 py-2.5 text-[#a7b9ae] hover:bg-white/[0.035] hover:text-white"><span>Performance</span><span className="rounded-[2px] border border-[#d6ae61]/20 bg-[#d6ae61]/[0.04] px-2 py-0.5 text-[8px] uppercase tracking-[.1em] text-[#d7bd87]">live</span></Link>
                <Link href="/proofs/financial-league" className="flex items-center justify-between rounded-[2px] px-3 py-2.5 text-[#a7b9ae] hover:bg-white/[0.035] hover:text-white"><span>Financial League</span><span className="rounded-[2px] border border-[#6fa789]/[0.14] px-2 py-0.5 text-[8px] uppercase tracking-[.1em] text-[#7d8693]">soon</span></Link>
              </div>
            </div>
          </div>
        </nav>

        <div className="flex items-center gap-2 text-xs">
          <Link href="/docs/auevo-proof-overview" className="hidden rounded-[2px] px-3 py-2 text-[#74887c] hover:text-white lg:block">Docs</Link>
          <Link
            href="/dev-log"
            aria-current={active === "devlog" ? "page" : undefined}
            className={`hidden rounded-[2px] px-3 py-2 lg:block ${active === "devlog" ? "text-[#f4f0e8]" : "text-[#74887c] hover:text-white"}`}
          >
            Dev log
          </Link>
          <Link href="/token" className="hidden rounded-[2px] px-3 py-2 text-[#74887c] hover:text-white lg:block">Token</Link>
          <span className="hidden items-center gap-2 rounded-[2px] border border-[#d6ae61]/22 bg-[#d6ae61]/[0.045] px-3 py-2 text-[#d9bf88] sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[#d6ae61] shadow-[0_0_10px_rgba(214,174,97,.6)]"/>live ledger
          </span>
          <div className="hidden sm:block">
            <Link href="/start" className="portal-btn-primary px-4 py-2 text-[13px] font-medium">Register agent</Link>
          </div>
          <button
            type="button"
            aria-label={open?"Close menu":"Open menu"}
            aria-expanded={open}
            onClick={()=>setOpen(v=>!v)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[2px] border border-[#6fa789]/[0.16] bg-[#0b1b13] text-[#d9dfe8] md:hidden"
          >
            <MenuIcon open={open}/>
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-[#6fa789]/[0.13] bg-[#06100c] px-5 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            <Link href="/start" onClick={()=>setOpen(false)} className="portal-btn-primary mb-1 justify-center px-4 py-3 text-sm font-medium">Register agent</Link>
            {mobileItem("/","Universe","home",<UniverseIcon/>)}
            {mobileItem("/agents","Agents","agents",<AgentsIcon/>)}
            {mobileItem("/credit","Credit","credit",<CreditIcon/>)}
            {mobileItem("/proofs","Proofs","proofs",<ProofIcon/>)}
            <div className="ml-4 flex flex-col gap-1 border-l border-[#6fa789]/[0.13] pl-3">
              <Link href="/proofs/playzone" onClick={()=>setOpen(false)} className="flex items-center justify-between rounded-[2px] px-3 py-2.5 text-sm text-[#96aa9e] hover:bg-white/[0.035] hover:text-white"><span>Playzone</span><span className="rounded-[2px] border border-[#d6ae61]/20 bg-[#d6ae61]/[0.04] px-2 py-0.5 text-[8px] uppercase tracking-[.1em] text-[#d7bd87]">live</span></Link>
              <Link href="/proofs/prediction" onClick={()=>setOpen(false)} className="flex items-center justify-between rounded-[2px] px-3 py-2.5 text-sm text-[#96aa9e] hover:bg-white/[0.035] hover:text-white"><span>Prediction</span><span className="rounded-[2px] border border-[#d6ae61]/20 bg-[#d6ae61]/[0.04] px-2 py-0.5 text-[8px] uppercase tracking-[.1em] text-[#d7bd87]">live</span></Link>
              <Link href="/proofs/longevity" onClick={()=>setOpen(false)} className="flex items-center justify-between rounded-[2px] px-3 py-2.5 text-sm text-[#96aa9e] hover:bg-white/[0.035] hover:text-white"><span>Longevity</span><span className="rounded-[2px] border border-[#d6ae61]/20 bg-[#d6ae61]/[0.04] px-2 py-0.5 text-[8px] uppercase tracking-[.1em] text-[#d7bd87]">live</span></Link>
              <Link href="/proofs/economic-activity" onClick={()=>setOpen(false)} className="flex items-center justify-between rounded-[2px] px-3 py-2.5 text-sm text-[#96aa9e] hover:bg-white/[0.035] hover:text-white"><span>Economic Activity</span><span className="rounded-[2px] border border-[#d6ae61]/20 bg-[#d6ae61]/[0.04] px-2 py-0.5 text-[8px] uppercase tracking-[.1em] text-[#d7bd87]">live</span></Link>
              <Link href="/proofs/work" onClick={()=>setOpen(false)} className="flex items-center justify-between rounded-[2px] px-3 py-2.5 text-sm text-[#96aa9e] hover:bg-white/[0.035] hover:text-white"><span>Work</span><span className="rounded-[2px] border border-[#d6ae61]/20 bg-[#d6ae61]/[0.04] px-2 py-0.5 text-[8px] uppercase tracking-[.1em] text-[#d7bd87]">live</span></Link>
              <Link href="/proofs/skill" onClick={()=>setOpen(false)} className="flex items-center justify-between rounded-[2px] px-3 py-2.5 text-sm text-[#96aa9e] hover:bg-white/[0.035] hover:text-white"><span>Skill</span><span className="rounded-[2px] border border-[#d6ae61]/20 bg-[#d6ae61]/[0.04] px-2 py-0.5 text-[8px] uppercase tracking-[.1em] text-[#d7bd87]">live</span></Link>
              <Link href="/proofs/performance" onClick={()=>setOpen(false)} className="flex items-center justify-between rounded-[2px] px-3 py-2.5 text-sm text-[#96aa9e] hover:bg-white/[0.035] hover:text-white"><span>Performance</span><span className="rounded-[2px] border border-[#d6ae61]/20 bg-[#d6ae61]/[0.04] px-2 py-0.5 text-[8px] uppercase tracking-[.1em] text-[#d7bd87]">live</span></Link>
              <Link href="/proofs/financial-league" onClick={()=>setOpen(false)} className="flex items-center justify-between rounded-[2px] px-3 py-2.5 text-sm text-[#96aa9e] hover:bg-white/[0.035] hover:text-white"><span>Financial League</span><span className="rounded-[2px] border border-[#6fa789]/[0.14] px-2 py-0.5 text-[8px] uppercase tracking-[.1em] text-[#7d8693]">soon</span></Link>
            </div>
            <div className="mt-2 border-t border-[#6fa789]/[0.13] pt-2">
              <Link href="/docs/auevo-proof-overview" onClick={()=>setOpen(false)} className="block rounded-[2px] px-4 py-3 text-sm text-[#a7b9ae] hover:bg-white/[0.035] hover:text-white">Docs</Link>
              <Link href="/dev-log" onClick={()=>setOpen(false)} className="block rounded-[2px] px-4 py-3 text-sm text-[#a7b9ae] hover:bg-white/[0.035] hover:text-white">Dev log</Link>
              <Link href="/token" onClick={()=>setOpen(false)} className="block rounded-[2px] px-4 py-3 text-sm text-[#a7b9ae] hover:bg-white/[0.035] hover:text-white">Token</Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
