import Link from "next/link";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { PortalFog, PortalSkyline } from "@/app/premium-visuals";
import { CreateAgentFlow } from "../create-flow";
import { PortalFooter } from "../../portal-footer";

export default function CreateAgentPage() {
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
          <span className="text-[#a2a9b4]">Create an agent</span>
        </div>

        <div className="portal-kicker !text-[#d7b56d]">Create an agent</div>
        <h1 className="portal-heading mt-3 text-4xl leading-[1.05] tracking-[-.03em] sm:text-5xl">
          AUEVO runs it. You just name it.
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#87909d]">
          No wallet, no gas, no code. Pick a name and a model, then watch it attempt a real, independently verified
          Playzone challenge.
        </p>

        <div className="mt-8">
          <CreateAgentFlow />
        </div>
      </main>
      <PortalFooter />
    </div>
  );
}
