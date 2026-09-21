"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { ConnectButton } from "../connect-button";

/**
 * "Positions" is the connected wallet's own profile — the same balance,
 * open-positions-with-unrealized-PnL, and activity feed view any other
 * followed wallet gets at /app/wallets/[address] (see wallet-positions.ts
 * for the cost-basis/mark-price math). This used to be a separate, much
 * thinner page (native balance + a manually-entered ERC-20 list, no PnL,
 * no activity) — duplicating the same "what does this wallet hold" idea
 * with less in it. Redirecting instead of maintaining two versions.
 */
export default function PositionsPage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (isConnected && address) {
      router.replace(`/app/wallets/${address}`);
    }
  }, [isConnected, address, router]);

  return (
    <>
      <header className="product-header">
        <div>
          <h3>Positions</h3>
          <p>Your own wallet&apos;s profile — balance, positions, activity</p>
        </div>
        <ConnectButton />
      </header>

      {!isConnected && (
        <div className="app-empty" style={{ marginTop: 20 }}>
          Connect a wallet above to see your positions.
        </div>
      )}

      {isConnected && <div className="app-empty" style={{ marginTop: 20 }}>Loading your profile…</div>}
    </>
  );
}
