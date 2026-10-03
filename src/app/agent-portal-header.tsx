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
          {item("/auevo","Proofs","proofs")}
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
