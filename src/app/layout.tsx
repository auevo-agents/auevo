import type { Metadata } from "next";
import "./globals.css";

// Auevo is repositioning from a Solana fee-bot scanner into a
// marketplace + scanner for tokenized real-world assets (see
// docs/RWA_SPEC.md) — this metadata described the old positioning and is
// now stale/misleading for what "/" actually shows. The old scanner
// lives on at /legacy/fees and keeps its own page-level copy.
export const metadata: Metadata = {
  metadataBase: new URL("https://auevo.io"),
  title: "Auevo — Every tokenized stock. Every issuer. Scanned.",
  description:
    "A marketplace for tokenized real-world assets — stocks, ETFs, treasuries, private credit — across issuers and chains, plus a scanner for premium/discount, arbitrage, risk and liquidity that a plain marketplace doesn't show you.",
  openGraph: {
    title: "Auevo — Every tokenized stock. Every issuer. Scanned.",
    description:
      "Tokenized real-world assets across issuers and chains, with the premium/discount, arbitrage, risk and liquidity data a plain marketplace doesn't show you.",
    url: "https://auevo.io",
    siteName: "Auevo",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Auevo — Every tokenized stock. Every issuer. Scanned.",
    description:
      "Tokenized real-world assets across issuers and chains, with the premium/discount, arbitrage, risk and liquidity data a plain marketplace doesn't show you.",
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
