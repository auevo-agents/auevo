import type { Metadata } from "next";
import { DocsSidebar } from "./docs-sidebar";
import { AgentPortalHeader } from "@/app/agent-portal-header";

export const metadata: Metadata = {
  title: "Auevo — Docs",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-shell min-h-screen text-[#f3f0ea]">
      <AgentPortalHeader />
      <div className="mx-auto max-w-[1500px] border-x border-white/[0.04] bg-[#07120d]">
        <div className="flex items-center justify-between border-b border-white/[0.055] px-6 py-5 lg:px-8">
          <div>
            <div className="text-[9px] uppercase tracking-[.22em] text-[#42d995]">Developer Portal</div>
            <div className="mt-1 font-serif text-2xl text-[#f1ece3]">AUEVO Documentation</div>
          </div>
          <div className="hidden items-center gap-3 text-[10px] uppercase tracking-[.1em] text-[#6e8277] sm:flex">
            <span className="rounded-[2px] border border-[#d7b56d]/18 bg-[#d7b56d]/[0.04] px-3 py-1.5 text-[#d7bd87]">v1.0 live</span>
            <span>Proof Protocol · SDK · APIs</span>
          </div>
        </div>
        <div className="docs-body">
          <DocsSidebar />
          <main className="docs-content">{children}</main>
        </div>
      </div>
    </div>
  );
}
