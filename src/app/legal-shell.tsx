import Link from "next/link";
import { AuevoLogo } from "./auevo-logo";

export function LegalShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="legal-shell">
      <header className="legal-topbar">
        <Link href="/" className="legal-brand" aria-label="Auevo home">
          <AuevoLogo />
        </Link>
        <Link href="/rwa/app" className="legal-workspace-link">Open workspace</Link>
      </header>
      <article className="legal-page">{children}</article>
    </main>
  );
}
