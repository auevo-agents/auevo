import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://auevo.io"),
  title: "Auevo — How much have you paid trading bots?",
  description:
    "Paste any Solana wallet address and see exactly how much you've paid Axiom, BullX, Trojan, BonkBot and other trading bots in fees.",
  openGraph: {
    title: "Auevo — Stop paying for their wins.",
    description:
      "Paste any Solana wallet address and see exactly how much you've paid Axiom, BullX, Trojan, BonkBot and other trading bots in fees. Free, no wallet connection.",
    url: "https://auevo.io",
    siteName: "Auevo",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Auevo — Stop paying for their wins.",
    description:
      "Paste any Solana wallet address and see exactly how much you've paid trading bots in fees. Free, no wallet connection.",
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
