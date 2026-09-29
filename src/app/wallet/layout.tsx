import type { Metadata } from "next";
import { WalletProviders } from "./providers";

export const metadata: Metadata = {
  title: "AUEVO Wallet",
  description: "A self-custodial wallet with an AI agent, built into Auevo.",
};

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return <WalletProviders>{children}</WalletProviders>;
}
