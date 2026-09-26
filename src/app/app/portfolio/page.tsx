"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { ConnectButton } from "../connect-button";

/**
 * "Portfolio" (RWA_SPEC.md section 6: /app/portfolio) is the connected
 * wallet's own profile — the same balance, open-positions-with-
 * unrealized-PnL, and activity feed view any other followed wallet gets
 * at /app/wallets/[address] (see wallet-positions.ts for the cost-basis/
 * mark-price math). Was at /app/positions and just did this same
 * redirect; renamed to match the RWA_SPEC.md route rather than keep a
 * second name for the same page. Section 6 calls this "RWA-портфель
 * кошелька в USD" — the USD rollup across chains is Phase 6 work, once
 * the indexer has USD pricing; this already covers the ETH-denominated
 * single-chain case Phase 6 will extend.
 */
export default function PortfolioPage() {
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
          <h3>Portfolio</h3>
          <p>Your own wallet&apos;s profile — balance, positions, activity</p>
        </div>
        <ConnectButton />
      </header>

      {!isConnected && (
        <div className="app-empty" style={{ marginTop: 20 }}>
          Connect a wallet above to see your portfolio.
        </div>
      )}

      {isConnected && <div className="app-empty" style={{ marginTop: 20 }}>Loading your profile…</div>}
    </>
  );
}
