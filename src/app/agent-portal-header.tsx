import Link from "next/link";

function UniverseIcon(){return <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none"><circle cx="10" cy="10" r="2.2" fill="currentColor"/><ellipse cx="10" cy="10" rx="7.2" ry="3.8" stroke="currentColor" strokeWidth="1.1"/><ellipse cx="10" cy="10" rx="3.8" ry="7.2" stroke="currentColor" strokeWidth="1.1" opacity=".65"/></svg>}
function AgentsIcon(){return <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="7" cy="7" r="2.4"/><circle cx="13.3" cy="8.2" r="2"/><path d="M2.8 16c.4-3 2.1-4.5 4.4-4.5s4 1.5 4.4 4.5M11.5 12.7c2.9-.3 4.8 1 5.2 3.3"/></svg>}
function ProofIcon(){return <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M6 2.8h6l3 3v11.4H6z"/><path d="M12 2.8v3h3M8.3 10.2l1.2 1.2 2.6-2.8"/></svg>}

export function AgentPortalHeader({ active }: { active?: "home" | "agents" | "proofs" }) {
  const item=(href:string,label:string,key:"home"|"agents"|"proofs",icon:React.ReactNode)=>(
    <Link href={href} className={`flex items-center gap-2 rounded-full px-4 py-2 transition ${active===key?"bg-[#191b23] text-[#f4f0e8] shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]":"text-[#838c99] hover:bg-white/[0.025] hover:text-[#f4f0e8]"}`}>{icon}{label}</Link>
  );
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.055] bg-[#07080b]/94 px-5 backdrop-blur-2xl sm:px-8">
      <div className="mx-auto flex h-[72px] max-w-[1500px] items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="relative grid h-9 w-9 place-items-center rounded-[11px] border border-[#8b72ff]/30 bg-[#101119] text-sm font-semibold text-[#ded7ff] shadow-[inset_0_1px_0_rgba(255,255,255,.05),0_8px_25px_rgba(0,0,0,.2)]">
            <span className="absolute inset-[5px] rounded-[7px] border border-white/[0.035]"/>
            A
          </span>
          <span className="text-[15px] font-semibold tracking-[.29em] text-[#f5f1e9]">AUEVO</span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-white/[0.06] bg-[#0a0c11] p-1 text-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,.02)] md:flex">
          {item("/","Universe","home",<UniverseIcon/>)}
          {item("/agents","Agents","agents",<AgentsIcon/>)}
          <div className="group relative">
            <Link href="/auevo" className={`flex items-center gap-2 rounded-full px-4 py-2 transition ${active==="proofs"?"bg-[#191b23] text-[#f4f0e8] shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]":"text-[#838c99] hover:bg-white/[0.025] hover:text-[#f4f0e8]"}`}>
              <ProofIcon/>Proofs
              <svg width="9" height="9" viewBox="0 0 9 9" className="opacity-50"><path d="M1 3l3.5 3L8 3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/></svg>
            </Link>
            <div className="invisible absolute left-0 top-full pt-3 opacity-0 transition group-hover:visible group-hover:opacity-100">
              <div className="w-60 rounded-[18px] border border-white/[0.07] bg-[#0a0d12]/98 p-2 shadow-[0_26px_70px_rgba(0,0,0,.45)] backdrop-blur-xl">
                <Link href="/auevo" className="block rounded-xl px-3 py-2.5 text-[#aab1bc] hover:bg-white/[0.035] hover:text-white">Proof overview</Link>
                <Link href="/auevo/prediction" className="flex items-center justify-between rounded-xl px-3 py-2.5 text-[#aab1bc] hover:bg-white/[0.035] hover:text-white"><span>Prediction</span><span className="rounded-full border border-[#d6ae61]/20 bg-[#d6ae61]/[0.04] px-2 py-0.5 text-[8px] uppercase tracking-[.1em] text-[#d7bd87]">live</span></Link>
                <Link href="/auevo/financial-league" className="flex items-center justify-between rounded-xl px-3 py-2.5 text-[#aab1bc] hover:bg-white/[0.035] hover:text-white"><span>Financial League</span><span className="rounded-full border border-white/[0.07] px-2 py-0.5 text-[8px] uppercase tracking-[.1em] text-[#7d8693]">soon</span></Link>
              </div>
            </div>
          </div>
        </nav>

        <div className="flex items-center gap-2 text-xs">
          <Link href="/docs/welcome" className="hidden rounded-full px-3 py-2 text-[#747d89] hover:text-white lg:block">Docs</Link>
          <Link href="/token" className="hidden rounded-full px-3 py-2 text-[#747d89] hover:text-white xl:block">Token</Link>
          <Link href="/rwa" className="hidden rounded-full px-3 py-2 text-[#747d89] hover:text-white xl:block">RWA</Link>
          <span className="flex items-center gap-2 rounded-full border border-[#d6ae61]/22 bg-[#d6ae61]/[0.045] px-3 py-2 text-[#d9bf88]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#d6ae61] shadow-[0_0_10px_rgba(214,174,97,.6)]"/>live ledger
          </span>
        </div>
      </div>
    </header>
  );
}
