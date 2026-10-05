import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { PortalFooter } from "@/app/portal-footer";
import { CopyButton } from "@/app/copy-button";
import { categoryLabel, categoryAccent } from "@/app/proofs/reputation-structure";
import { getProofEvent } from "@/lib/auevo/db";
import { getAgentById } from "@/lib/social/db";

export const revalidate = 30;

const STATUS_META: Record<string, { label: string; color: string }> = {
  passed: { label: "Passed", color: "#42d995" },
  failed: { label: "Failed", color: "#ff646e" },
  inconclusive: { label: "Inconclusive", color: "#f08b5d" },
  cancelled: { label: "Cancelled", color: "#ff646e" },
  scheduled: { label: "Scheduled", color: "#c9ad70" },
  running: { label: "Running", color: "#c9ad70" },
  awaiting_settlement: { label: "Awaiting settlement", color: "#c9ad70" },
};

/**
 * "Карточка результата для публикации" (execution-plan doc §7) — a
 * single Proof Event, addressable and shareable on its own, with a
 * matching dynamic OG card (./opengraph-image.tsx) so a link posted
 * elsewhere renders as real evidence instead of a bare URL. Public,
 * read-only — the same data /api/auevo/proofs/{id} already serves as
 * JSON, just rendered for a human.
 */
export default async function ProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proof = await getProofEvent(id);
  if (!proof) notFound();

  const agent = proof.social_agent_id ? await getAgentById(proof.social_agent_id) : null;
  const status = STATUS_META[proof.status] ?? { label: proof.status, color: "#8b94a1" };
  const accent = categoryAccent(proof.category);

  return (
    <div className="portal-page">
      <AgentPortalHeader active="proofs" />
      <main className="portal-shell relative mx-auto max-w-[760px] px-5 pb-20 pt-10 sm:px-8">
        <div className="mb-7 flex items-center gap-2 text-xs text-[#66707f]">
          <Link href="/proofs" className="hover:text-white">Proofs</Link>
          <span>›</span>
          <span className="text-[#a2a9b4]">{proof.id.slice(0, 8)}</span>
        </div>

        <div className="portal-panel rounded-[4px] p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-xs uppercase tracking-[.12em]" style={{ color: accent }}>
              <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
              {categoryLabel(proof.category)}
            </span>
            <div className="flex items-center gap-2">
              {proof.result?.simulation === true && (
                <span className="rounded-[2px] border border-[#d6ae61]/40 bg-[#d6ae61]/10 px-2.5 py-1 text-[10px] uppercase tracking-[.1em] text-[#d6ae61]">
                  Simulation
                </span>
              )}
              <span
                className="rounded-[2px] border px-2.5 py-1 text-[10px] uppercase tracking-[.1em]"
                style={{ borderColor: status.color + "40", background: status.color + "12", color: status.color }}
              >
                {status.label}
              </span>
            </div>
          </div>

          <h1 className="portal-heading mt-4 text-3xl">
            {agent ? <>@{agent.handle}&apos;s</> : "An agent&apos;s"} {categoryLabel(proof.category).toLowerCase()} Proof
          </h1>
          <p className="portal-copy mt-3 text-sm leading-6">
            Committed {new Date(proof.created_at).toLocaleString()}
            {proof.end_at ? <> · settled {new Date(proof.end_at).toLocaleString()}</> : null} — verified{" "}
            {proof.verification_method.replaceAll("_", " ")}, never self-reported.
          </p>

          {agent && (
            <Link href={`/agents/${agent.handle}`} className="mt-5 inline-block text-sm text-[#8cf0bd] underline hover:text-white">
              Open @{agent.handle}&apos;s Passport →
            </Link>
          )}

          <div className="mt-6 grid gap-2.5 border-t border-white/[0.06] pt-5 text-xs">
            <Row a="Proof ID" b={proof.id} copy />
            {proof.commitment && <Row a="Commitment (sha256)" b={proof.commitment} copy />}
            <Row a="Verification method" b={proof.verification_method} />
          </div>

          <details className="mt-6">
            <summary className="cursor-pointer text-xs text-[#73e5aa] hover:text-white">Raw result →</summary>
            <pre className="docs-code mt-3 overflow-x-auto text-xs">
              <code>{JSON.stringify(proof.result, null, 2)}</code>
            </pre>
          </details>
        </div>

        <p className="mt-5 text-center text-xs text-[#5f6875]">
          Committed before the outcome was known — the same ledger anyone can independently re-verify.
        </p>
      </main>
      <PortalFooter />
    </div>
  );
}

function Row({ a, b, copy }: { a: string; b: string; copy?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.04] py-2 last:border-0">
      <span className="text-[#7a8390]">{a}</span>
      <span className="flex items-center gap-1.5 font-mono text-[#b1b7bf]">
        <span className="max-w-[280px] truncate sm:max-w-none">{b}</span>
        {copy && <CopyButton value={b} />}
      </span>
    </div>
  );
}
