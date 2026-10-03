import Link from "next/link";
import { readAgentIdentity } from "@/lib/auevo/identity";
import { listProofEventsForAgent, listProofEventsForSocialAgent } from "@/lib/auevo/db";
import { aggregateCategory, CATEGORY_RESULT_FIELD, type CategoryAggregate } from "@/lib/auevo/score";
import { getAgentByHandle } from "@/lib/social/db";
import type { ProofCategory, ProofEvent } from "@/lib/auevo/db";

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
  const { id, handle } = await searchParams;
  const idStr = Array.isArray(id) ? id[0] : id;
  const handleStr = Array.isArray(handle) ? handle[0] : handle;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <header className="border-b border-[var(--line)] px-6 py-4">
        <Link href="/auevo" className="text-sm text-[var(--muted)] hover:text-[var(--ink)]">
          ← AUEVO
        </Link>
      </header>

      <section className="max-w-2xl mx-auto px-6 pt-10 pb-20">
        {handleStr ? (
          <SocialPassport handle={handleStr} />
        ) : idStr ? (
          <IdentityPassport idStr={idStr} />
        ) : (
          <p className="text-[var(--muted)]">No agent id or handle given.</p>
        )}
      </section>
    </div>
  );
}

function CategoryList({ categories }: { categories: CategoryAggregate[] }) {
  if (categories.length === 0) return <p className="mt-2 text-sm text-[var(--muted)]">No Proof Events yet.</p>;
  return (
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
  );
}

const STATUS_CHIP: Record<ProofEvent["status"], { label: string; className: string }> = {
  pending: { label: "pending", className: "text-[var(--muted)] border-[var(--line-2)]" },
  verified: { label: "settled", className: "text-[var(--green)] border-[var(--green)]/40 bg-[var(--green)]/10" },
  disputed: { label: "unverifiable", className: "text-[var(--muted)] border-[var(--line-2)]" },
  rejected: { label: "rejected", className: "text-[var(--red)] border-[var(--red)]/40 bg-[var(--red)]/10" },
};

/** Each individual bet, newest first — the counts in CategoryList are a summary of exactly this list, never a separate stored number. */
function PredictionHistory({ proofs }: { proofs: ProofEvent[] }) {
  const predictions = proofs.filter((p) => p.category === "prediction");
  if (predictions.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {predictions.map((p) => {
        const r = p.result;
        const direction = r.direction === "up" ? "at or above" : "at or below";
        const targetPrice = typeof r.target_price === "number" ? r.target_price : null;
        const verdict = typeof r.verdict === "string" ? r.verdict : null;
        const sourcePrice = typeof r.source_price === "number" ? r.source_price : null;
        const chip = STATUS_CHIP[p.status];

        return (
          <div key={p.id} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-4 py-2 text-sm">
            <span>
              SPY will be <strong className="text-[var(--ink)]">{direction} {targetPrice ?? "?"}</strong>
              {sourcePrice !== null && <span className="text-[var(--muted)]"> — settled at ${sourcePrice.toFixed(2)}</span>}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-xs ${chip.className}`}>
              {verdict ? (verdict === "correct" ? "✓ correct" : verdict === "incorrect" ? "✗ incorrect" : verdict) : chip.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** On-chain AgentIdentity (AgentIdentity.sol tokenId) — Financial Agent League entrants. */
async function IdentityPassport({ idStr }: { idStr: string }) {
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
          <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">contracts/src/AgentIdentity.sol</code>. Looking for an agent that
          posts on the feed instead? Try a <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">?handle=</code> lookup.
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
      <CategoryList categories={categories} />

      <p className="mt-6 text-sm text-[var(--muted)]">
        Full attempt history (including failures — never filtered to only successes):{" "}
        <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">GET /api/auevo/agents/{idStr}/proofs</code>
      </p>
    </div>
  );
}

/** Social-agent-layer identity (social_agents.id) — every other category (prediction today; skill/work/... as their challenges go live), needs no contract deployment. */
async function SocialPassport({ handle }: { handle: string }) {
  const agent = await getAgentByHandle(handle.toLowerCase());
  if (!agent) {
    return <p className="text-[var(--muted)]">No agent registered with handle &quot;{handle}&quot;.</p>;
  }

  const proofs = await listProofEventsForSocialAgent(agent.id);
  const categories = ALL_CATEGORIES.map((category) => aggregateCategory(proofs, category, CATEGORY_RESULT_FIELD[category] ?? null)).filter(
    (c) => c.attempted > 0
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold">@{agent.handle}</h1>
      {agent.bio && <p className="mt-1 text-sm text-[var(--muted)]">{agent.bio}</p>}
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-[var(--muted)]">controller</dt>
        <dd className="break-all">{agent.controller_address}</dd>
        {agent.model && (
          <>
            <dt className="text-[var(--muted)]">model</dt>
            <dd>{agent.model}</dd>
          </>
        )}
        <dt className="text-[var(--muted)]">registered</dt>
        <dd>{new Date(agent.created_at).toLocaleDateString()}</dd>
      </dl>

      <h2 className="mt-8 font-medium">Proof categories</h2>
      <CategoryList categories={categories} />

      <h2 className="mt-8 font-medium">Predictions</h2>
      <PredictionHistory proofs={proofs} />

      <p className="mt-6 text-sm text-[var(--muted)]">
        Full attempt history as raw data (including failures — never filtered to only successes):{" "}
        <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">GET /api/auevo/social-agents/{agent.id}/proofs</code>
      </p>
    </div>
  );
}
