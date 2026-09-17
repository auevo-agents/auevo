import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auevo — How much have you paid trading bots?",
  description:
    "Paste any Solana wallet address and see exactly how much you've paid Axiom, BullX, Trojan, BonkBot and other trading bots in fees.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
