import type { Metadata } from "next";
import { AppProviders } from "./providers";
import { Sidebar } from "./sidebar";
import { GeoBanner } from "@/app/geo-banner";
import { AuevoMark } from "@/app/auevo-logo";

export const metadata: Metadata = {
  title: "Auevo — Workspace",
  robots: { index: false, follow: false },
};

export default async function AppSectionLayout({ children }: LayoutProps<"/rwa/app">) {
  return (
    <AppProviders>
      <main className="app-shell rwa-green-theme">
        <div className="app-ambient" aria-hidden="true">
          <AuevoMark className="app-ambient-mark" />
          <span className="app-ambient-orbit app-ambient-orbit-one" />
          <span className="app-ambient-orbit app-ambient-orbit-two" />
          <span className="app-ambient-node app-ambient-node-one" />
          <span className="app-ambient-node app-ambient-node-two" />
        </div>
        <Sidebar />
        <GeoBanner />
        <div className="product-main app-main">{children}</div>
      </main>
    </AppProviders>
  );
}
