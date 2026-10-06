import Link from "next/link";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { PortalFooter } from "@/app/portal-footer";
import { AUEVO_DEV_LOG } from "@/lib/dev-log";
import { DevLogTable } from "./dev-log-table";

/**
 * Dated changelog for AUEVO as a whole — Credit has its own narrower one
 * at /credit/protocol/dev-log, for AgentCreditPool specifically. Content
 * lives in src/lib/dev-log.ts — append an entry there by hand whenever
 * something real ships, same standing rule as Credit's own dev log:
 * never backfilled, written as the system actually changes.
 */
export default function DevLogPage() {
  return (
    <div className="portal-page">
      <AgentPortalHeader />

      <section className="portal-shell relative mx-auto max-w-[900px] px-5 pt-14 pb-20 sm:px-8">
        <h1 className="portal-heading text-4xl sm:text-5xl">Dev log</h1>
        <p className="mt-4 leading-relaxed text-[#8f9bad]">
          Every real change to AUEVO — by date, with what changed and why, including when a first attempt at a fix
          turned out not to actually work. Updated by hand as the system itself changes, never backfilled.{" "}
          <Link href="/credit/protocol/dev-log" className="underline hover:text-white">
            AgentCreditPool has its own, narrower dev log →
          </Link>
        </p>

        <DevLogTable entries={AUEVO_DEV_LOG} />
      </section>
      <PortalFooter />
    </div>
  );
}
