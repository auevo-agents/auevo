import { AgentPortalHeader } from "@/app/agent-portal-header";
import { CreditSubnav } from "../../credit-subnav";
import { ProtocolSubnav } from "../protocol-subnav";
import { CREDIT_DEV_LOG } from "@/lib/credit/dev-log";
import { PortalFooter } from "@/app/portal-footer";

export const revalidate = 300;

/**
 * Dated changelog for AgentCreditPool and everything around it. Content
 * lives in src/lib/credit/dev-log.ts — append an entry there by hand
 * whenever this system actually changes; this page only renders it.
 */
export default function CreditDevLogPage() {
  return (
    <div className="portal-page">
      <AgentPortalHeader active="credit" />

      <section className="portal-shell relative mx-auto max-w-[900px] px-5 pt-14 pb-20 sm:px-8">
        <CreditSubnav active="protocol" />
        <ProtocolSubnav active="devlog" />

        <h1 className="portal-heading text-4xl sm:text-5xl">Dev log</h1>
        <p className="mt-4 text-[var(--muted)] leading-relaxed">
          Every real change to AgentCreditPool, its identity registry and seats — by date, with what changed and why.
          Updated by hand as the system itself changes, never backfilled.
        </p>

        <div className="mt-10 flex flex-col gap-8">
          {CREDIT_DEV_LOG.map((entry, i) => (
            <article key={`${entry.date}-${i}`} className="border-l-2 border-[var(--line)] pl-5">
              <div className="flex flex-wrap items-baseline gap-3">
                <time className="font-mono text-xs text-[#d6ae61]">{entry.date}</time>
                <h2 className="text-lg font-medium text-[var(--ink)]">{entry.title}</h2>
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {entry.body.map((p, j) => (
                  <p key={j} className="text-sm text-[var(--muted)] leading-relaxed">
                    {p}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
      <PortalFooter />
    </div>
  );
}
