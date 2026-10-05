import type { Metadata } from "next";
import Link from "next/link";
import { DocsSidebar } from "./docs-sidebar";
import { AuevoMark } from "@/app/auevo-logo";

export const metadata: Metadata = {
  title: "Auevo — RWA Docs",
};

/**
 * Deliberately not the main AgentPortalHeader: these docs are scoped to
 * the RWA trading platform and are reached only from inside /rwa (the
 * landing page and the app sidebar) — never from the main Auevo portal
 * chrome. A lightweight RWA-flavored bar instead of the full
 * Agents/Credit/Proofs nav keeps that scoping visible, not just enforced
 * by which links exist.
 */
export default function RwaDocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-shell min-h-screen text-[#f3f0ea]">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between border-b border-white/[0.055] px-6 py-5 lg:px-8">
        <Link href="/rwa" className="flex items-center gap-2.5 text-[#f1ece3] no-underline">
          <AuevoMark className="h-6 w-6" />
          <span className="font-serif text-lg">Auevo</span>
        </Link>
        <Link
          href="/rwa"
          className="rounded-[2px] border border-[#42d995]/18 bg-[#42d995]/[0.04] px-3 py-1.5 text-[10px] uppercase tracking-[.1em] text-[#8cf0bd] no-underline hover:bg-[#42d995]/[0.09]"
        >
          ← Back to RWA
        </Link>
      </div>
      <div className="mx-auto max-w-[1500px] border-x border-white/[0.04] bg-[#07120d]">
        <div className="flex items-center justify-between border-b border-white/[0.055] px-6 py-5 lg:px-8">
          <div>
            <div className="text-[9px] uppercase tracking-[.22em] text-[#42d995]">RWA Docs</div>
            <div className="mt-1 font-serif text-2xl text-[#f1ece3]">Trading Platform Documentation</div>
          </div>
          <div className="hidden items-center gap-3 text-[10px] uppercase tracking-[.1em] text-[#6e8277] sm:flex">
            <span>Assets · Trading · Pools · Lend</span>
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
