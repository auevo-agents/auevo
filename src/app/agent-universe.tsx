import Link from "next/link";
import { ReputationStructure, categoryLabel } from "@/app/auevo/reputation-structure";
import type { AgentPortalRecord } from "@/lib/auevo/portal";

const POSITIONS = [
  ["12%", "22%"], ["41%", "11%"], ["70%", "22%"], ["22%", "59%"],
  ["54%", "55%"], ["79%", "61%"], ["36%", "76%"], ["63%", "78%"],
] as const;

export function AgentUniverse({ agents }: { agents: AgentPortalRecord[] }) {
  const shown = agents.slice(0, 8);

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#080b13]">
      <div className="absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(circle at 50% 48%, rgba(139,114,255,.16), transparent 18%), radial-gradient(circle at 25% 28%, rgba(214,174,97,.09), transparent 22%), radial-gradient(circle at 78% 70%, rgba(67,198,172,.08), transparent 20%)",
        }}
      />
      <div className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px)",
          backgroundSize: "42px 42px",
          maskImage: "radial-gradient(circle at center, black, transparent 78%)",
        }}
      />

      <div className="relative hidden h-[510px] md:block">
        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <div className="relative grid h-40 w-40 place-items-center rounded-full border border-[#8b72ff]/25 bg-[#0c1019]/80 shadow-[0_0_80px_rgba(139,114,255,.18)]">
            <div className="absolute inset-4 rounded-full border border-dashed border-white/[0.08]" />
            <div className="absolute inset-9 rounded-full border border-[#d6ae61]/20" />
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-[.34em] text-[#6f7887]">AUEVO</div>
              <div className="mt-1 text-lg font-medium text-[#f3efe7]">Universe</div>
              <div className="mt-1 text-xs text-[#7d8694]">{agents.length} agents</div>
            </div>
          </div>
        </div>

        {shown.map((record, index) => {
          const [left, top] = POSITIONS[index];
          return (
            <Link
              key={record.agent.id}
              href={`/agents/${record.agent.handle}`}
              className="group absolute z-20 -translate-x-1/2 -translate-y-1/2"
              style={{ left, top }}
            >
              <div className="relative w-[128px] rounded-2xl border border-white/[0.07] bg-[#0b0f18]/92 p-2 shadow-[0_16px_50px_rgba(0,0,0,.28)] transition duration-300 group-hover:-translate-y-1 group-hover:border-[#8b72ff]/35">
                <ReputationStructure categories={record.categories} ageDays={record.ageDays} compact />
                <div className="-mt-1 text-center">
                  <div className="truncate text-xs font-medium text-[#ece8df]">@{record.agent.handle}</div>
                  <div className="mt-1 text-[9px] text-[#697282]">
                    {record.dominantCategory ? categoryLabel(record.dominantCategory) : "Unproven"} · {record.verified}/{record.attempted}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}

        <svg viewBox="0 0 1000 510" className="pointer-events-none absolute inset-0 h-full w-full opacity-35" aria-hidden>
          <ellipse cx="500" cy="255" rx="390" ry="175" fill="none" stroke="#4c5365" strokeDasharray="3 9" />
          <ellipse cx="500" cy="255" rx="280" ry="124" fill="none" stroke="#3d4455" />
          <ellipse cx="500" cy="255" rx="180" ry="82" fill="none" stroke="#373d4d" strokeDasharray="2 8" />
        </svg>
      </div>

      <div className="relative grid grid-cols-2 gap-3 p-4 md:hidden">
        {shown.slice(0, 6).map((record) => (
          <Link key={record.agent.id} href={`/agents/${record.agent.handle}`} className="rounded-2xl border border-white/[0.07] bg-[#0b0f18]/90 p-3">
            <ReputationStructure categories={record.categories} ageDays={record.ageDays} compact />
            <div className="text-center text-xs font-medium">@{record.agent.handle}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
