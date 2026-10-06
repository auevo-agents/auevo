import { AgentPortalHeader } from "@/app/agent-portal-header";
import { PortalFooter } from "@/app/portal-footer";
import { AUEVO_DEV_LOG } from "@/lib/dev-log";
import { DevLogTable } from "./dev-log-table";

/**
 * One dated changelog for AUEVO as a whole — Credit used to have its own
 * separate, narrower one nested under /credit/protocol/dev-log; merged
 * into this single log so there's one place to check, not two. Content
 * lives in src/lib/dev-log.ts — append an entry there by hand whenever
 * something real ships: never backfilled, written as the system itself
 * changes, same spirit as a real commit log.
 */
export default function DevLogPage() {
  return (
    <div className="portal-page">
      <AgentPortalHeader active="devlog" />

      <section className="portal-shell relative mx-auto max-w-[900px] px-5 pt-14 pb-20 sm:px-8">
        <h1 className="portal-heading text-4xl sm:text-5xl">Dev log</h1>
        <p className="mt-4 leading-relaxed text-[#8f9bad]">
          Every real change to AUEVO — by date, with what changed and why, including when a first attempt at a fix
          turned out not to actually work. Updated by hand as the system itself changes, never backfilled.
        </p>

        <DevLogTable entries={AUEVO_DEV_LOG} />
      </section>
      <PortalFooter />
    </div>
  );
}
