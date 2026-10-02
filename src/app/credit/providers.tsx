"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { getWagmiConfig } from "@/lib/wagmi";

/**
 * Same wagmi/React Query wrapper as src/app/rwa/app/providers.tsx —
 * duplicated rather than imported across section boundaries (matches
 * chains.ts's own "Auevo's stack is independent end to end" posture) so
 * /credit never depends on anything /rwa/app happens to change.
 */
export function CreditProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={getWagmiConfig()}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
