import Link from "next/link";

export function AgentPortalHeader({ active }: { active?: "home" | "agents" | "proofs" }) {
  const item=(href:string,label:string,key:"home"|"agents"|"proofs")=>(
    <Link href={href} className={`rounded-full px-4 py-2 transition ${active===key?"bg-[#171922] text-[#f4f0e8] shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]":"text-[#8e95a2] hover:text-[#f4f0e8]"}`}>{label}</Link>
  );
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.055] bg-[#08090d]/92 px-5 backdrop-blur-xl sm:px-8">
      <div className="mx-auto flex h-[70px] max-w-[1500px] items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-md border border-[#8b72ff]/30 bg-[#12121a] text-sm font-semibold text-[#d8d0ff]">A</span>
          <span className="text-[15px] font-semibold tracking-[.28em] text-[#f5f1e9]">AUEVO</span>
        </Link>
        <nav className="hidden items-center gap-1 rounded-full border border-white/[0.06] bg-[#0b0d12] p-1 text-sm md:flex">
          {item("/","Universe","home")}
          {item("/agents","Agents","agents")}
          <div className="group relative">
            <Link
              href="/auevo"
              className={`flex items-center gap-1 rounded-full px-4 py-2 transition ${active==="proofs"?"bg-[#171922] text-[#f4f0e8] shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]":"text-[#8e95a2] hover:text-[#f4f0e8]"}`}
            >
              Proofs
              <svg width="9" height="9" viewBox="0 0 9 9" className="opacity-60"><path d="M1 3l3.5 3L8 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </Link>
            <div className="invisible absolute left-0 top-full pt-2 opacity-0 transition group-hover:visible group-hover:opacity-100">
              <div className="w-56 rounded-2xl border border-white/[0.08] bg-[#0b0d12] p-1.5 shadow-[0_12px_32px_rgba(0,0,0,.45)]">
                <Link href="/auevo" className="block rounded-xl px-3 py-2 text-[#aab2be] hover:bg-white/[0.04] hover:text-white">Overview</Link>
                <Link href="/auevo/prediction" className="flex items-center justify-between rounded-xl px-3 py-2 text-[#aab2be] hover:bg-white/[0.04] hover:text-white">
                  Prediction
                  <span className="rounded-full border border-[#d6ae61]/25 bg-[#d6ae61]/[0.05] px-1.5 py-0.5 text-[9px] uppercase tracking-[.08em] text-[#d9bf88]">live</span>
                </Link>
                <Link href="/auevo/financial-league" className="flex items-center justify-between rounded-xl px-3 py-2 text-[#aab2be] hover:bg-white/[0.04] hover:text-white">
                  Financial League
                  <span className="rounded-full border border-white/[0.08] px-1.5 py-0.5 text-[9px] uppercase tracking-[.08em] text-[#8c95a3]">blocked</span>
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <div className="flex items-center gap-4 text-xs text-[#777f8d]">
          <Link href="/token" className="hidden hover:text-white lg:block">Token</Link>
          <Link href="/rwa" className="hidden hover:text-white lg:block">RWA</Link>
          <span className="rounded-full border border-[#d6ae61]/25 bg-[#d6ae61]/[0.05] px-3 py-1.5 text-[#d9bf88]">live ledger</span>
        </div>
      </div>
    </header>
  );
}
