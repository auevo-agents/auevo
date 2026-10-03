import Link from "next/link";
import { ProofCity3D, type ProofCityAgent } from "@/app/auevo/proof-city-3d";
import { categoryLabel } from "@/app/auevo/reputation-structure";
import type { AgentPortalRecord } from "@/lib/auevo/portal";

function toCityAgent(r: AgentPortalRecord): ProofCityAgent {
  return {
    id: r.agent.id,
    handle: r.agent.handle,
    ageDays: r.ageDays,
    attempted: r.attempted,
    verified: r.verified,
    pending: r.pending,
    rejected: r.rejected,
    dominantCategory: r.dominantCategory,
    categories: r.categories.map((c) => ({
      category: c.category,
      attempted: c.attempted,
      verified: c.verified,
      confidence: c.confidence,
    })),
  };
}

export function AgentUniverse({ agents }: { agents: AgentPortalRecord[] }) {
  const shown = agents.slice(0, 24);
  const cityAgents = shown.map(toCityAgent);
  const featured = shown.slice(0, 4);

  return (
    <div className="relative overflow-hidden rounded-[34px] border border-white/[0.07] bg-[#080a0e] shadow-[0_30px_90px_rgba(0,0,0,.42)]">
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-white/[0.055] bg-[#090b10]/84 px-5 py-4 backdrop-blur-xl">
        <div>
          <div className="text-[9px] uppercase tracking-[.24em] text-[#7f72d9]">Live 3D network</div>
          <div className="mt-1 font-serif text-lg text-[#eee9df]">AUEVO Universe</div>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-[#737b87]">
          <span>{agents.length} agents</span>
          <span className="h-1 w-1 rounded-full bg-[#d5ab61]" />
          <span>{agents.reduce((s, a) => s + a.verified, 0)} verified</span>
        </div>
      </div>

      <ProofCity3D agents={cityAgents} className="h-[560px] md:h-[620px]" />

      <div className="absolute inset-x-4 bottom-4 z-10 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {featured.map((r) => (
          <Link
            key={r.agent.id}
            href={"/agents/" + r.agent.handle}
            className="rounded-2xl border border-white/[0.07] bg-[#0b0e14]/88 p-3 backdrop-blur-xl transition hover:border-[#8b72ff]/30 hover:bg-[#0d1018]/94"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-[#ece7df]">@{r.agent.handle}</div>
                <div className="mt-1 text-[9px] text-[#69727f]">
                  {r.dominantCategory ? categoryLabel(r.dominantCategory) : "Unproven"} · {r.verified}/{r.attempted}
                </div>
              </div>
              <span className="rounded-full border border-[#d6ae61]/20 bg-[#d6ae61]/[0.05] px-2 py-1 text-[8px] uppercase tracking-[.08em] text-[#d6bd8a]">
                view
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
