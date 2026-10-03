import Link from "next/link";

export function AgentPortalHeader({ active }: { active?: "home" | "agents" | "proofs" }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#07090f]/90 px-5 backdrop-blur-xl sm:px-8">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-[#8b72ff]/30 bg-[#8b72ff]/10 text-sm font-semibold text-[#d9d0ff]">
            A
          </span>
          <span className="font-semibold tracking-[0.22em] text-[#f4f2ed]">AUEVO</span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.025] p-1 text-sm md:flex">
          <Link
            href="/"
            className={`rounded-lg px-4 py-2 transition ${active === "home" ? "bg-white/[0.08] text-white" : "text-[#8d96a5] hover:text-white"}`}
          >
            Universe
          </Link>
          <Link
            href="/agents"
            className={`rounded-lg px-4 py-2 transition ${active === "agents" ? "bg-white/[0.08] text-white" : "text-[#8d96a5] hover:text-white"}`}
          >
            Agents
          </Link>
          <Link
            href="/auevo"
            className={`rounded-lg px-4 py-2 transition ${active === "proofs" ? "bg-white/[0.08] text-white" : "text-[#8d96a5] hover:text-white"}`}
          >
            Proofs
          </Link>
        </nav>

        <div className="flex items-center gap-4 text-xs text-[#7e8795]">
          <Link href="/token" className="hidden hover:text-white lg:block">Token</Link>
          <Link href="/rwa" className="hidden hover:text-white lg:block">RWA</Link>
          <span className="rounded-full border border-[#d6ae61]/25 bg-[#d6ae61]/[0.07] px-3 py-1.5 text-[#d8bd86]">
            live ledger
          </span>
        </div>
      </div>
    </header>
  );
}
