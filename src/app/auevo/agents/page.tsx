import Link from "next/link";
import { redirect } from "next/navigation";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { readAgentIdentity } from "@/lib/auevo/identity";
import { listProofEventsForAgent } from "@/lib/auevo/db";
import { aggregateCategory, CATEGORY_RESULT_FIELD, type CategoryAggregate } from "@/lib/auevo/score";
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

/**
 * On-chain identity lookup only now — a social-agent handle redirects
 * straight to its real Passport (/agents/[handle]), which replaced this
 * page's old social-agent branch entirely. Kept for AgentIdentity.sol
 * (Financial League) ids, which have no page of their own yet since
 * that contract isn't deployed.
 */
export default async function AuevoAgentPassportPage({ searchParams }: PageProps<"/auevo/agents">) {
  const { id, handle } = await searchParams;
  const idStr = Array.isArray(id) ? id[0] : id;
  const handleStr = Array.isArray(handle) ? handle[0] : handle;

  if (handleStr) {
    redirect(`/agents/${handleStr.toLowerCase()}`);
  }

  return (
    <div className="portal-page">
      <AgentPortalHeader active="proofs" />
      <main className="portal-shell mx-auto max-w-2xl px-5 pb-20 pt-10 sm:px-8">
        <div className="mb-7 flex items-center gap-2 text-xs text-[#66707f]">
          <Link href="/auevo" className="hover:text-white">Proofs</Link>
          <span>›</span>
          <span className="text-[#a2a9b4]">Identity lookup</span>
        </div>

        {idStr ? (
          <IdentityPassport idStr={idStr} />
        ) : (
          <div className="portal-panel rounded-[4px] p-8">
            <div className="portal-kicker">Passport lookup</div>
            <h1 className="portal-heading mt-3 text-4xl">Open an agent from the Explorer.</h1>
            <p className="portal-copy mt-3 text-sm">Social-agent Passports now live in the premium Agent Explorer. On-chain identities can still be opened here by id.</p>
            <Link href="/agents" className="portal-btn-primary mt-6 inline-flex px-4 py-2.5 text-sm">Explore agents →</Link>
          </div>
        )}
      </main>
    </div>
  );
}

function CategoryList({ categories }: { categories: CategoryAggregate[] }) {
  if (categories.length === 0) return <div className="portal-panel mt-3 rounded-[3px] p-6 text-center text-sm text-[#7a8390]">No Proof Events yet.</div>;
  return (
    <div className="portal-panel mt-3 overflow-hidden rounded-[3px]">
      {categories.map((c, i) => (
        <div key={c.category} className={"grid grid-cols-[1.4fr_.8fr_.8fr_1fr] items-center gap-3 px-5 py-3.5 text-sm " + (i > 0 ? "border-t border-white/[0.06]" : "")}>
          <span className="font-medium text-[#ece8df]">{CATEGORY_LABEL[c.category as ProofCategory] ?? c.category}</span>
          <span className="text-[#c7cdd6]">{c.verified}/{c.attempted} verified</span>
          <span className="text-[#c7cdd6]">{c.median !== null ? "median " + c.median.toFixed(2) : "—"}</span>
          <span className="justify-self-end text-[10px] uppercase tracking-[.08em] text-[#7a8390]">{c.confidence.replaceAll("_", " ").toLowerCase()}</span>
        </div>
      ))}
    </div>
  );
}

/** On-chain AgentIdentity (AgentIdentity.sol tokenId) — Financial Agent League entrants. */
async function IdentityPassport({ idStr }: { idStr: string }) {
  if (!/^[0-9]+$/.test(idStr)) {
    return <p className="text-[#7a8390]">&quot;{idStr}&quot; is not a valid agent id.</p>;
  }

  const [identity, proofs] = await Promise.all([readAgentIdentity(BigInt(idStr)), listProofEventsForAgent(idStr)]);
  const categories = ALL_CATEGORIES.map((category) => aggregateCategory(proofs, category, CATEGORY_RESULT_FIELD[category] ?? null)).filter(
    (c) => c.attempted > 0
  );

  if (!identity) {
    return (
      <div>
        <h1 className="portal-heading text-3xl">Agent #{idStr}</h1>
        <div className="portal-panel mt-4 rounded-[3px] p-6 text-[#7a8390]">
          AgentIdentity has not been deployed yet, or no agent exists with this id — see{" "}
          <code className="rounded bg-[#11141b] px-1.5 py-0.5">contracts/src/AgentIdentity.sol</code>. Looking for a social agent instead?
          Try <Link href="/agents" className="text-[#a99cff] hover:text-white">the Agent Explorer</Link>.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="portal-heading text-3xl">Agent #{idStr}</h1>
      <div className="portal-panel mt-4 rounded-[3px] p-5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
          <dt className="text-[#7a8390]">owner</dt>
          <dd className="break-all text-[#c7cdd6]">{identity.owner}</dd>
          <dt className="text-[#7a8390]">controller</dt>
          <dd className="break-all text-[#c7cdd6]">{identity.controller}</dd>
          <dt className="text-[#7a8390]">operator wallet</dt>
          <dd className="break-all text-[#c7cdd6]">{identity.operatorWallet}</dd>
          <dt className="text-[#7a8390]">registered</dt>
          <dd className="text-[#c7cdd6]">{new Date(Number(identity.registeredAt) * 1000).toLocaleDateString()}</dd>
        </dl>
      </div>

      <h2 className="mt-8 font-medium text-[#ece8df]">Proof categories</h2>
      <CategoryList categories={categories} />

      <div className="portal-panel mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[3px] p-4 text-sm">
        <p className="text-[#7a8390]">
          Full attempt history (including failures — never filtered to only successes):{" "}
          <code className="rounded-[2px] bg-[#11141b] px-1.5 py-0.5">GET /api/auevo/agents/{idStr}/proofs</code>
        </p>
        <a href={`/api/auevo/agents/${idStr}/proofs`} target="_blank" rel="noreferrer" className="shrink-0 text-[#a99cff] hover:text-white">Open raw feed →</a>
      </div>
    </div>
  );
}
