"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatUnits, isAddress, type Address } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { ConnectButton } from "../connect-button";

/**
 * A watchlist of addresses — read-only, browser-local. Useful for
 * keeping an eye on other wallets (a treasury, a team member, a wallet
 * flagged by the token scanner) without connecting them.
 */

const BALANCE_ABI = [
  {
    type: "function",
    name: "getEthBalance",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

// Multicall3 — canonical address, identical across EVM chains.
const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";

const STORAGE_KEY = "auevo.watchedWallets";

export default function WalletsPage() {
  const { address: connected } = useAccount();
  const [watched, setWatched] = useState<string[]>([]);
  const [newAddress, setNewAddress] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setWatched(JSON.parse(raw));
    } catch {
      // Private window or blocked storage — list just starts empty.
    }
  }, []);

  function persist(next: string[]) {
    setWatched(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Best-effort — still works for this page load.
    }
  }

  const balances = useReadContracts({
    allowFailure: true,
    contracts: watched.map(
      (addr) =>
        ({
          address: MULTICALL3,
          abi: BALANCE_ABI,
          functionName: "getEthBalance",
          args: [addr as Address],
        }) as const
    ),
    query: { enabled: watched.length > 0 },
  });

  return (
    <main className="app-shell">
      <WalletsSidebar />

      <div className="product-main app-main">
        <header className="product-header">
          <div>
            <h3>Wallets</h3>
            <p>Watch any address&apos;s native balance, read-only</p>
          </div>
          <ConnectButton />
        </header>

        <div className="trade-field" style={{ maxWidth: 460, marginTop: 20 }}>
          <span>Address to watch</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value.trim())}
              placeholder="0x…"
              spellCheck={false}
            />
            <button
              className="app-connect-button"
              onClick={() => {
                if (
                  isAddress(newAddress, { strict: false }) &&
                  !watched.includes(newAddress)
                ) {
                  persist([...watched, newAddress]);
                  setNewAddress("");
                }
              }}
            >
              Watch
            </button>
          </div>
        </div>

        {connected && !watched.includes(connected) && (
          <p className="scan-note" style={{ marginTop: 12 }}>
            Your connected wallet ({connected.slice(0, 6)}…{connected.slice(-4)}) isn&apos;t on the
            list —{" "}
            <button className="app-link-button" onClick={() => persist([...watched, connected])}>
              add it
            </button>
            .
          </p>
        )}

        {watched.length > 0 && (
          <div className="scan-holder-table" style={{ marginTop: 20 }}>
            {watched.map((addr, i) => {
              const raw = balances.data?.[i]?.result as bigint | undefined;
              return (
                <div
                  className="scan-holder-row"
                  key={addr}
                  style={{ gridTemplateColumns: "1fr auto auto" }}
                >
                  <code className="scan-mono">
                    {addr.slice(0, 8)}…{addr.slice(-6)}
                    {addr.toLowerCase() === connected?.toLowerCase() && " (you)"}
                  </code>
                  <span>{raw !== undefined ? `${Number(formatUnits(raw, 18)).toFixed(4)} ETH` : "…"}</span>
                  <button className="app-untrack" onClick={() => persist(watched.filter((a) => a !== addr))}>
                    remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function WalletsSidebar() {
  return (
    <aside className="product-sidebar">
      <div className="product-logo">
        <strong>auevo</strong>
        <i />
      </div>
      <nav className="product-nav">
        <Link href="/app" className="app-nav-link">
          <span className="nav-icon">
            <i />
            <i />
            <i />
            <i />
          </span>
          <b>Overview</b>
        </Link>
        <Link href="/app/market" className="app-nav-link">
          <span className="nav-icon nav-bots">
            <i />
          </span>
          <b>Market</b>
        </Link>
        <Link href="/app/trading" className="app-nav-link">
          <span className="nav-icon nav-trading">
            <i />
            <i />
            <i />
          </span>
          <b>Trading</b>
        </Link>
        <Link href="/app/positions" className="app-nav-link">
          <span className="nav-icon nav-position">
            <i />
            <i />
          </span>
          <b>Positions</b>
        </Link>
        <button className="active">
          <span className="nav-icon nav-wallet">
            <i />
          </span>
          <b>Wallets</b>
        </button>
      </nav>
    </aside>
  );
}
