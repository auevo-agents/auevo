import Link from "next/link";
import { AgentPortalHeader } from "./agent-portal-header";
import { PortalFog, PortalSkyline } from "./premium-visuals";

export function LegalShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="portal-page min-h-screen">
      <AgentPortalHeader />
      <PortalFog />
      <PortalSkyline className="pointer-events-none absolute inset-x-0 top-16 h-[420px] w-full opacity-[.08]" />
      <article className="legal-page portal-panel portal-shell relative mx-auto mt-10 max-w-[980px] rounded-[30px] p-6 sm:p-10">
        {children}
      </article>
    </main>
  );
}
