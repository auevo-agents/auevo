import type { Metadata } from "next";
import { AppProviders } from "./providers";

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

export default function AppSectionLayout({
  children,
}: LayoutProps<"/app">) {
  return <AppProviders>{children}</AppProviders>;
}
