import Link from "next/link";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { PortalFog, PortalSkyline } from "@/app/premium-visuals";
import { getCreditPoolAddress, readPoolParams } from "@/lib/credit/contract";

export const revalidate = 60;

/**
 * Public landing page for AgentCreditPool — Priors-style unsecured-from-
 * the-agent credit, fully backed by a third party, never by Auevo itself
 * (see contracts/src/AgentCreditPool.sol's own doc comment for the full
 * security model). Honest about deployment status rather than pointing
 * at a placeholder address, same convention as /rwa/app/bots: the
 * contract is written and tested but NEXT_PUBLIC_CREDIT_POOL_ADDRESS
 * stays unset until someone runs contracts/script/deploy-credit-pool.mjs
 * with their own key, deliberately, from their own machine.
 */
export default async function CreditLandingPage() {
  const deployed = Boolean(getCreditPoolAddress());
  const params = deployed ? await readPoolParams() : null;

  return (
    <div className="portal-page">
      <AgentPortalHeader />

      <section className="portal-shell relative mx-auto max-w-[1100px] px-5 pt-14 pb-6 sm:px-8">
        <nav className="mb-6 flex gap-1 text-sm">
          <span className="rounded-[2px] bg-white/[0.05] px-3 py-1.5 text-[var(--ink)]">Pool</span>
          <Link href="/credit/agents" className="rounded-[2px] px-3 py-1.5 text-[var(--muted)] hover:text-[var(--ink)]">
            Agents
          </Link>
        </nav>

        <h1 className="portal-heading text-4xl sm:text-5xl">Credit for AI agents</h1>
        <p className="mt-4 text-[var(--muted)] leading-relaxed">
          An agent borrows a stablecoin to pay for what it needs, and repays with a fee. Every line is backed by a
          real third party putting its own money behind that one agent — never by Auevo. If the agent doesn&apos;t
          repay, that backer&apos;s stake pays first; lenders are never the first to lose. Every repayment is
          written on chain, where anyone can check it.
        </p>
        <p className="mt-4 text-sm text-[var(--muted)]">
          Modeled on{" "}
          <a className="underline hover:text-[var(--ink)]" href="https://priors.trade" target="_blank" rel="noopener noreferrer">
            Priors
          </a>
          &apos;s public v2 design, independently reimplemented for Auevo —{" "}
          <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">contracts/src/AgentCreditPool.sol</code> in the repo.
        </p>
      </section>

      <section className="portal-shell relative mx-auto max-w-[1100px] px-5 pb-20 sm:px-8">
        {!deployed ? (
          <div className="portal-panel rounded-[3px] p-6 text-[var(--muted)]">
            <p>
              <strong className="text-[var(--ink)]">Not deployed yet.</strong> The contract is written and tested
              (29 integration tests — see <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">contracts/README.md</code>),
              but deploying it is a decision with immediate financial-security consequences — it becomes a public,
              fundable address the moment it&apos;s live. That step is deliberately manual: someone runs{" "}
              <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">contracts/script/deploy-credit-pool.mjs</code>{" "}
              with their own key, from their own machine, after deciding which identity registry to trust.
            </p>
            <p className="mt-3">
              Once deployed, set <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">NEXT_PUBLIC_CREDIT_POOL_ADDRESS</code>{" "}
              to bring this page fully live.
            </p>
          </div>
        ) : (
          <div className="portal-panel rounded-[3px] p-6">
            <h2 className="font-medium">Live parameters</h2>
            {params ? (
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm text-[var(--muted)]">
                <dt>Loan size</dt>
                <dd className="text-[var(--ink)]">
                  {params.minLoan.toString()} – {params.maxLoan.toString()} (raw units)
                </dd>
                <dt>Fee</dt>
                <dd className="text-[var(--ink)]">{Number(params.feeBps) / 100}% per 30 days</dd>
                <dt>Min root stake</dt>
                <dd className="text-[var(--ink)]">{params.minRootStake.toString()} (raw units)</dd>
                <dt>Asset</dt>
                <dd className="text-[var(--ink)] break-all">{params.asset}</dd>
                <dt>Pool</dt>
                <dd className="text-[var(--ink)] break-all">{params.pool}</dd>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">Could not read pool parameters from the chain.</p>
            )}
          </div>
        )}

        <div className="mt-6 portal-panel rounded-[3px] p-6">
          <h2 className="font-medium">Check an agent</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Free, public, no key:{" "}
            <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">GET /api/credit/check?agent=&lt;id&gt;</code>
          </p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Know its on-chain id, its AUEVO handle, or both — either is enough to open its record.
          </p>
          <form action="/credit/agent" method="get" className="mt-3 flex flex-wrap gap-2">
            <input name="id" placeholder="on-chain agent id" className="flex-1 portal-input rounded-[3px] px-3 py-2 text-sm" />
            <input name="handle" placeholder="AUEVO handle (optional)" className="flex-1 portal-input rounded-[3px] px-3 py-2 text-sm" />
            <button className="portal-btn-primary rounded-[3px] px-4 py-2 text-sm" type="submit">
              Open
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
