import Link from "next/link";
import { ProofCitadel } from "@/app/auevo/proof-citadel";
import { categoryLabel } from "@/app/auevo/reputation-structure";
import type { AgentPortalRecord } from "@/lib/auevo/portal";

const POSITIONS=[
  ["15%","24%"],["39%","12%"],["70%","21%"],["24%","61%"],
  ["55%","58%"],["82%","61%"],["39%","79%"],["68%","80%"],
] as const;

export function AgentUniverse({agents}:{agents:AgentPortalRecord[]}) {
  const shown=agents.slice(0,8);
  return (
    <div className="relative overflow-hidden rounded-[30px] border border-white/[0.07] bg-[#090b10] shadow-[0_30px_80px_rgba(0,0,0,.35)]">
      <div className="absolute inset-0" style={{background:"radial-gradient(circle at 50% 45%,rgba(139,114,255,.08),transparent 28%),radial-gradient(circle at 72% 38%,rgba(214,174,97,.05),transparent 20%)"}}/>
      <div className="absolute inset-0 opacity-35" style={{backgroundImage:"linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px)",backgroundSize:"36px 36px",maskImage:"radial-gradient(circle at center,black,transparent 82%)"}}/>
      <div className="relative hidden h-[540px] md:block">
        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="mx-auto h-28 w-28 rounded-full border border-[#d6ae61]/20 bg-[#0c0e13] shadow-[0_0_70px_rgba(139,114,255,.12)]">
            <div className="grid h-full place-items-center">
              <div>
                <div className="text-[9px] uppercase tracking-[.34em] text-[#6f7681]">AUEVO</div>
                <div className="mt-1 font-serif text-xl text-[#f1ecdf]">Universe</div>
                <div className="mt-1 text-[10px] text-[#6c7480]">{agents.length} agents</div>
              </div>
            </div>
          </div>
        </div>
        {shown.map((r,i)=>{
          const [left,top]=POSITIONS[i];
          return <Link key={r.agent.id} href={"/agents/"+r.agent.handle} className="group absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{left,top}}>
            <div className="w-[134px] rounded-2xl border border-white/[0.06] bg-[#0a0d13]/95 p-2.5 transition duration-300 group-hover:-translate-y-1 group-hover:border-[#8b72ff]/25">
              <ProofCitadel categories={r.categories} proofs={r.proofs} ageDays={r.ageDays} compact/>
              <div className="-mt-1 text-center">
                <div className="truncate text-xs text-[#ebe6dd]">@{r.agent.handle}</div>
                <div className="mt-1 text-[9px] text-[#69717f]">{r.dominantCategory?categoryLabel(r.dominantCategory):"Unproven"} · {r.verified}/{r.attempted}</div>
              </div>
            </div>
          </Link>
        })}
        <svg viewBox="0 0 1000 540" className="pointer-events-none absolute inset-0 h-full w-full opacity-30">
          <ellipse cx="500" cy="270" rx="400" ry="185" fill="none" stroke="#4e4a5f" strokeDasharray="2 10"/>
          <ellipse cx="500" cy="270" rx="290" ry="128" fill="none" stroke="#3a3e48"/>
          <ellipse cx="500" cy="270" rx="185" ry="84" fill="none" stroke="#554d65" strokeDasharray="2 8"/>
        </svg>
      </div>
      <div className="relative grid grid-cols-2 gap-3 p-4 md:hidden">
        {shown.slice(0,6).map(r=><Link key={r.agent.id} href={"/agents/"+r.agent.handle} className="rounded-2xl border border-white/[0.06] bg-[#0a0d13] p-2"><ProofCitadel categories={r.categories} proofs={r.proofs} ageDays={r.ageDays} compact/><div className="text-center text-xs">@{r.agent.handle}</div></Link>)}
      </div>
    </div>
  );
}
