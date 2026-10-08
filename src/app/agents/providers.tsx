"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { getWagmiConfig } from "@/lib/wagmi";

/** Same wagmi/React Query wrapper as /proofs's AuevoProviders and /credit's CreditProviders — duplicated per section on purpose, see those files' own comments. Needed here because AgentAppearanceGarden (garden/appearance-owner.tsx) is the first thing under /agents/* to call useAccount/useSignMessage, for wallet-controlled agents saving their forest-garden appearance. */
export function AgentsProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={getWagmiConfig()}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
