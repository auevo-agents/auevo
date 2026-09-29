import type { Metadata } from "next";
import { AppProviders } from "./providers";
import { Sidebar } from "./sidebar";
import { GeoBanner } from "../geo-banner";
import { AuevoMark } from "../auevo-logo";

/**
 * Internal workspace — not the public marketing site. Kept out of the
 * sitemap and out of search results while it's just us testing: this is
 * a request for search engines to skip it, not real access control — the
 * routes are still reachable by anyone with the URL, same as any other
 * page on a public deployment. Don't treat noindex as a security
 * boundary when wiring up anything that touches funds here later.
 */
export const metadata: Metadata = {
  title: "Auevo — Workspace",
  robots: { index: false, follow: false },
};

export default async function AppSectionLayout({ children }: LayoutProps<"/app">) {
  return (
    <AppProviders>
      <main className="app-shell">
        <div className="app-ambient" aria-hidden="true">
          <AuevoMark className="app-ambient-mark" />
          <span className="app-ambient-orbit app-ambient-orbit-one" />
          <span className="app-ambient-orbit app-ambient-orbit-two" />
          <span className="app-ambient-node app-ambient-node-one" />
          <span className="app-ambient-node app-ambient-node-two" />
        </div>
        <Sidebar />
        <div className="app-workspace">
          <GeoBanner />
          <div className="product-main app-main">{children}</div>
        </div>
      </main>
    </AppProviders>
  );
}
