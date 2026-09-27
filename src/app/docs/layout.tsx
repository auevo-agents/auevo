import type { Metadata } from "next";
import Link from "next/link";
import { DocsSidebar } from "./docs-sidebar";

export const metadata: Metadata = {
  title: "Auevo — Docs",
};

/**
 * GitBook-style shell: a slim header, then a left sidebar (nav tree,
 * see docs-sidebar.tsx) with the page content on the right — the layout
 * the user explicitly asked for ("слева сайдбар меню как gitbook справа
 * информация"). Public, unlike /app: this documents the product for
 * anyone, not the internal workspace.
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-shell">
      <header className="landing-header">
        <Link href="/" className="landing-brand">
          auevo<span>_</span>
        </Link>
        <Link href="/app" className="landing-cta-ghost">
          Open workspace →
        </Link>
      </header>
      <div className="docs-body">
        <DocsSidebar />
        <main className="docs-content">{children}</main>
      </div>
    </div>
  );
}
