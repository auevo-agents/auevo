import type { Metadata } from "next";
import Link from "next/link";
import { DocsSidebar } from "./docs-sidebar";
import { AuevoLogo } from "../auevo-logo";

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
      <header className="docs-topbar">
        <Link href="/" className="docs-brand" aria-label="Auevo home">
          <AuevoLogo />
          <span className="docs-brand-divider" />
          <span className="docs-brand-label">Documentation</span>
        </Link>

        <nav className="docs-topbar-nav" aria-label="Documentation">
          <Link href="/docs/welcome">Guides</Link>
          <Link href="/docs/supported-chains">Networks</Link>
          <Link href="/docs/premium-and-discount">Scanner</Link>
        </nav>

        <div className="docs-topbar-actions">
          <span className="docs-version">v1.0 · live</span>
          <Link href="/app" className="docs-workspace-link">
            Open workspace <span>↗</span>
          </Link>
        </div>
      </header>
      <div className="docs-body">
        <DocsSidebar />
        <main className="docs-content">{children}</main>
      </div>
    </div>
  );
}
