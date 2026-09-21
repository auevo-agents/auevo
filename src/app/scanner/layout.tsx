import type { Metadata } from "next";

/**
 * The scanner needs its own metadata: the root layout still describes the
 * Solana fee scanner, and a link to a risk report shared in a group chat
 * should not unfurl as something else entirely.
 */
export const metadata: Metadata = {
  title: "Auevo — Token security scanner for Robinhood Chain",
  description:
    "Paste any token address on Robinhood Chain and see what its contract still lets the owner do — mint, pause, blacklist, or replace the code. Free, read-only, no wallet connection.",
  openGraph: {
    title: "Auevo — Check the contract before you buy.",
    description:
      "Read-only security scan of any Robinhood Chain token: privileged functions, ownership, proxy upgrades and holder concentration.",
    url: "https://auevo.io/scanner",
    siteName: "Auevo",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Auevo — Check the contract before you buy.",
    description:
      "Read-only security scan of any Robinhood Chain token: privileged functions, ownership, proxy upgrades and holder concentration.",
  },
};

export default function ScannerLayout({ children }: LayoutProps<"/scanner">) {
  return children;
}
