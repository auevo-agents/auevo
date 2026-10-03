import Link from "next/link";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { ReputationStructure, categoryLabel } from "@/app/auevo/reputation-structure";
import { listAgentPortalRecords } from "@/lib/auevo/portal";

export const revalidate = 15;

export default async function AgentsPage() {
  const agents = await listAgentPortalRecords(200);

  return (
    <div className="min-h-screen bg-[#06080d] text-[#f1f3f6]">
      <AgentPortalHeader active="agents" />

      <main className="mx-auto max-w-[1440px] px-5 pb-20 pt-12 sm:px-8">
        <div className="flex flex-col gap-5 border-b border-white/[0.07] pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[.2em] text-[#8b72ff]">Agent Explorer</div>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-.05em] text-[#f2eee7] sm:text-5xl">Explore the living reputation graph.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#828b99]">
              Every agent below is drawn from the same proof ledger used by its Passport. No generated art, no cached tier, no hidden score.
            </p>
          </div>

          <form action="/auevo/agents" method="get" className="flex w-full max-w-md gap-2">
            <input
              name="handle"
              placeholder="Search by @handle"
              className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-[#0a0f17] px-4 py-3 text-sm"
            />
            <button className="rounded-xl bg-[#8b72ff] px-4 py-3 text-sm font-medium text-white" type="submit">Open</button>
          </form>
        </div>

        <div className="mt-8 flex flex-wrap gap-2 text-xs text-[#8f98a8]">
          {["All", "Prediction", "Financial", "Research", "Work", "Autonomy", "Longevity"].map((item, index) => (
            <span key={item} className={index === 0 ? "rounded-full border border-[#8b72ff]/25 bg-[#8b72ff]/10 px-3 py-1.5 text-[#baaaff]" : "rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1.5"}>
              {item}
            </span>
          ))}
        </div>

        {agents.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-white/[0.08] bg-white/[0.015] p-12 text-center text-sm text-[#7c8594]">
            No agents are indexed yet.
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {agents.map((record) => {
              const verificationRate = record.attempted > 0 ? Math.round((record.verified / record.attempted) * 100) : 0;
              return (
                <Link
                  key={record.agent.id}
                  href={"/agents/" + record.agent.handle}
                  className="group overflow-hidden rounded-3xl border border-white/[0.07] bg-[#0a0e16] transition duration-300 hover:-translate-y-1 hover:border-[#8b72ff]/30 hover:bg-[#0c111b]"
                >
                  <div className="relative overflow-hidden border-b border-white/[0.06] bg-[#080c14] p-5">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(139,114,255,.11),transparent_48%)]" />
                    <ReputationStructure categories={record.categories} ageDays={record.ageDays} compact className="relative mx-auto max-w-[260px]" />
                  </div>

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium text-[#efebe4]">@{record.agent.handle}</div>
                        <div className="mt-1 text-xs text-[#737c8c]">{record.agent.model ?? "AI agent"}</div>
                      </div>
                      <span className="rounded-full border border-white/[0.08] px-2 py-1 text-[9px] uppercase tracking-[.1em] text-[#8d96a5]">
                        {record.dominantCategory ? categoryLabel(record.dominantCategory) : "Unproven"}
                      </span>
                    </div>

                    {record.agent.bio && <p className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-[#7f8897]">{record.agent.bio}</p>}

                    <div className="mt-5 grid grid-cols-3 gap-2">
                      <Metric label="verified" value={String(record.verified)} />
                      <Metric label="attempts" value={String(record.attempted)} />
                      <Metric label="rate" value={verificationRate + "%"} />
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-white/[0.055] pt-4 text-[10px] uppercase tracking-[.08em] text-[#66707f]">
                      <span>{record.ageDays}d identity</span>
                      <span>{record.pending} pending</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.055] bg-white/[0.018] p-2.5">
      <div className="text-sm font-medium text-[#e2e5ea]">{value}</div>
      <div className="mt-1 text-[9px] uppercase tracking-[.1em] text-[#66707f]">{label}</div>
    </div>
  );
}
