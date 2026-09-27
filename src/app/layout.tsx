import type { Metadata } from "next";
import "./globals.css";

// Auevo is repositioning from a Solana fee-bot scanner into a
// marketplace + scanner for tokenized real-world assets (see
// docs/RWA_SPEC.md) — this metadata described the old positioning and is
// now stale/misleading for what "/" actually shows. The old scanner
// lives on at /legacy/fees and keeps its own page-level copy.
export const metadata: Metadata = {
  metadataBase: new URL("https://auevo.io"),
  title: "Auevo — One platform for everything tokenized.",
  description:
    "Search every tokenized stock, ETF, treasury, commodity and credit claim. Compare issuers, check contract risk, trade in one signature, earn on pools and baskets, track your portfolio — all in one place.",
  openGraph: {
    title: "Auevo — One platform for everything tokenized.",
    description:
      "Search, compare, trade, earn and track every tokenized stock, ETF, treasury, commodity and credit claim, across every issuer and chain — all without leaving Auevo.",
    url: "https://auevo.io",
    siteName: "Auevo",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Auevo — One platform for everything tokenized.",
    description:
      "Search, compare, trade, earn and track every tokenized stock, ETF, treasury, commodity and credit claim, across every issuer and chain — all without leaving Auevo.",
  },
  verification: {
    google: "-qVb443obwXraFs4OWaGDR9l8lFDZcl5fDKT6fMVN-c",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
