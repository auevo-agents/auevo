"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";
import { WALLET_CHAINS } from "@/lib/wallet/tokens";

/**
 * AUEVO Wallet's own provider tree — deliberately separate from
 * src/app/app/providers.tsx's AppProviders. That one wires wagmi for the
 * RWA trading workspace's connect-your-own-wallet flow (the wallet signs
 * its own transactions, the app never touches a key). This one is a
 * different product: an embedded, Privy-custodied wallet with email/
 * phone/X login. Sharing one provider tree would mean either running two
 * unrelated wallet SDKs together everywhere, or coupling /app's build to
 * Privy's — not worth it while the two stay separate products under one
 * site (see HANDOFF.md's "hybrid, Option C" decision).
 *
 * Without NEXT_PUBLIC_PRIVY_APP_ID set, this renders children directly
 * with no provider — the page below reads that same env var and shows a
 * "not configured yet" state instead of crashing on a missing app id.
 */
export function WalletProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  const tree = (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  if (!appId) return tree;

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "sms", "twitter"],
        appearance: {
          theme: "dark",
          accentColor: "#5fe6a3",
          logo: "/logos/auevo.png",
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
        defaultChain: WALLET_CHAINS[0],
        supportedChains: [...WALLET_CHAINS],
      }}
    >
      {tree}
    </PrivyProvider>
  );
}
