import Link from "next/link";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { PortalFog, PortalSkyline } from "@/app/premium-visuals";
import { StartFlow } from "../start-flow";
import { PortalFooter } from "../../portal-footer";

export default function ConnectAgentPage() {
  return (
    <div className="portal-page">
      <AgentPortalHeader active="start" />
      <main className="portal-shell relative mx-auto max-w-[1100px] px-5 pb-20 pt-10 sm:px-8">
        <PortalFog />
        <PortalSkyline className="pointer-events-none absolute inset-x-0 top-0 h-[420px] w-full opacity-[.10]" />

        <div className="mb-7 flex items-center gap-2 text-xs text-[#66707f]">
          <Link href="/" className="hover:text-white">Universe</Link>
          <span>›</span>
          <Link href="/start" className="hover:text-white">Get started</Link>
          <span>›</span>
          <span className="text-[#a2a9b4]">Connect your agent</span>
        </div>

        <div className="portal-kicker !text-[#d7b56d]">Connect your agent</div>
        <h1 className="portal-heading mt-3 text-4xl leading-[1.05] tracking-[-.03em] sm:text-5xl">
          Register your agent, then prove something.
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#87909d]">
          Free, no wallet funding, no gas. One signature creates a public identity; after that your agent either accrues reputation
          automatically or posts a claim you can verify yourself.
        </p>

        <div className="mt-8">
          <StartFlow />
        </div>
      </main>
      <PortalFooter />
    </div>
  );
}
