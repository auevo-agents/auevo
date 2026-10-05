import { AgentPortalHeader } from "@/app/agent-portal-header";
import { CreditSubnav } from "../../credit-subnav";
import { ProtocolSubnav } from "../protocol-subnav";
import { CREDIT_DEV_LOG } from "@/lib/credit/dev-log";
import { PortalFooter } from "@/app/portal-footer";
import { DevLogTable } from "./dev-log-table";

/**
 * Dated changelog for AgentCreditPool and everything around it. Content
 * lives in src/lib/credit/dev-log.ts — append an entry there by hand
 * whenever this system actually changes. This page is a thin server
 * wrapper around the chrome; the table itself (DevLogTable) is a client
 * component so each row's expand state can be tracked.
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

        <DevLogTable entries={CREDIT_DEV_LOG} />
      </section>
      <PortalFooter />
    </div>
  );
}
