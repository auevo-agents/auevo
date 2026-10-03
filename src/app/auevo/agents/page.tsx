import Link from "next/link";
import { readAgentIdentity } from "@/lib/auevo/identity";
import { listProofEventsForAgent } from "@/lib/auevo/db";
import { aggregateCategory, CATEGORY_RESULT_FIELD } from "@/lib/auevo/score";
import type { ProofCategory } from "@/lib/auevo/db";

export const revalidate = 15;

const ALL_CATEGORIES: ProofCategory[] = [
  "identity",
  "skill",
  "work",
  "performance",
  "economic_activity",
  "financial_performance",
  "prediction",
  "autonomy",
  "longevity",
];

const CATEGORY_LABEL: Record<ProofCategory, string> = {
  identity: "Identity",
  skill: "Skill",
  work: "Work",
  performance: "Performance",
  economic_activity: "Economic activity",
  financial_performance: "Financial performance",
  prediction: "Prediction",
  autonomy: "Autonomy",
  longevity: "Longevity",
};

export default async function AuevoAgentPassportPage({ searchParams }: PageProps<"/auevo/agents">) {
  const { id } = await searchParams;
  const idStr = Array.isArray(id) ? id[0] : id;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <header className="border-b border-[var(--line)] px-6 py-4">
        <Link href="/auevo" className="text-sm text-[var(--muted)] hover:text-[var(--ink)]">
          ← AUEVO
        </Link>
      </header>

      <section className="max-w-2xl mx-auto px-6 pt-10 pb-20">
        {!idStr ? <p className="text-[var(--muted)]">No agent id given.</p> : <Passport idStr={idStr} />}
      </section>
    </div>
  );
}

async function Passport({ idStr }: { idStr: string }) {
  if (!/^[0-9]+$/.test(idStr)) {
    return <p className="text-[var(--muted)]">&quot;{idStr}&quot; is not a valid agent id.</p>;
  }

  const [identity, proofs] = await Promise.all([readAgentIdentity(BigInt(idStr)), listProofEventsForAgent(idStr)]);
  const categories = ALL_CATEGORIES.map((category) => aggregateCategory(proofs, category, CATEGORY_RESULT_FIELD[category] ?? null)).filter(
    (c) => c.attempted > 0
  );

  if (!identity) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Agent #{idStr}</h1>
        <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6 text-[var(--muted)]">
          AgentIdentity has not been deployed yet, or no agent exists with this id — see{" "}
          <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">contracts/src/AgentIdentity.sol</code>.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Agent #{idStr}</h1>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-[var(--muted)]">owner</dt>
        <dd className="break-all">{identity.owner}</dd>
        <dt className="text-[var(--muted)]">controller</dt>
        <dd className="break-all">{identity.controller}</dd>
        <dt className="text-[var(--muted)]">operator wallet</dt>
        <dd className="break-all">{identity.operatorWallet}</dd>
        <dt className="text-[var(--muted)]">registered</dt>
        <dd>{new Date(Number(identity.registeredAt) * 1000).toLocaleDateString()}</dd>
      </dl>

      <h2 className="mt-8 font-medium">Proof categories</h2>
      {categories.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted)]">No Proof Events yet.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {categories.map((c) => (
            <div key={c.category} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{CATEGORY_LABEL[c.category as ProofCategory] ?? c.category}</span>
                <span className="text-xs text-[var(--muted)]">confidence: {c.confidence}</span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-1 text-sm text-[var(--muted)]">
                <dt>Attempted</dt>
                <dd className="text-[var(--ink)]">{c.attempted}</dd>
                <dt>Verified</dt>
                <dd className="text-[var(--ink)]">{c.verified}</dd>
                {c.median !== null && (
                  <>
                    <dt>Median result</dt>
                    <dd className="text-[var(--ink)]">{c.median.toFixed(2)}</dd>
                  </>
                )}
              </dl>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-sm text-[var(--muted)]">
        Full attempt history (including failures — never filtered to only successes):{" "}
        <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">GET /api/auevo/agents/{idStr}/proofs</code>
      </p>
    </div>
  );
}
