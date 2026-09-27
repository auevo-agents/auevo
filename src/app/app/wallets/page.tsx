"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatUnits, isAddress, type Address } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { ConnectButton } from "../connect-button";
import { shortenAddress } from "@/lib/format";
import {
  readWatchedWallets,
  unwatchWallet,
  watchWallet,
  type WatchedWallet,
} from "@/lib/watched-wallets";

/**
 * A watchlist of addresses — read-only, browser-local, no different from
 * before in that sense. What changed: a followed wallet is a card with a
 * name you give it, not a bare address, and clicking it opens a real
 * profile (balance + our own indexer's activity feed) instead of dead-
 * ending here — the "just a list" gap this page used to have.
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

export default function WalletsPage() {
  const { address: connected } = useAccount();
  const [watched, setWatched] = useState<WatchedWallet[]>([]);
  const [newAddress, setNewAddress] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWatched(readWatchedWallets());
  }, []);

  const balances = useReadContracts({
    allowFailure: true,
    contracts: watched.map(
      (w) =>
        ({
          address: MULTICALL3,
          abi: BALANCE_ABI,
          functionName: "getEthBalance",
          args: [w.address as Address],
        }) as const,
    ),
    query: { enabled: watched.length > 0 },
  });

  return (
    <>
      <header className="product-header product-header--wallets">
        <div>
          <h3>Wallets</h3>
          <p>Follow any address — balance, name, and its real activity feed</p>
        </div>
        <ConnectButton />
      </header>

      <div className="trade-field" style={{ maxWidth: 460, marginTop: 20 }}>
        <span>Address to follow</span>
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
              if (isAddress(newAddress, { strict: false })) {
                setWatched(watchWallet(newAddress));
                setNewAddress("");
              }
            }}
          >
            Follow
          </button>
        </div>
      </div>

      {connected && !watched.some((w) => w.address.toLowerCase() === connected.toLowerCase()) && (
        <p className="scan-note" style={{ marginTop: 12 }}>
          Your connected wallet ({shortenAddress(connected)}) isn&apos;t on the list —{" "}
          <button className="app-link-button" onClick={() => setWatched(watchWallet(connected))}>
            follow it
          </button>
          .
        </p>
      )}

      {watched.length > 0 && (
        <div className="wallet-card-grid">
          {watched.map((w, i) => {
            const raw = balances.data?.[i]?.result as bigint | undefined;
            const isYou = w.address.toLowerCase() === connected?.toLowerCase();
            return (
              <Link key={w.address} href={`/app/wallets/${w.address}`} className="wallet-card">
                <span className="wallet-card-avatar" style={{ background: colorFor(w.address) }} />
                <span className="wallet-card-body">
                  <strong>
                    {w.label ?? shortenAddress(w.address, 6, 4)}
                    {isYou && " (you)"}
                  </strong>
                  <code className="scan-mono">{shortenAddress(w.address, 8, 6)}</code>
                </span>
                <span className="wallet-card-balance">
                  {raw !== undefined ? `${Number(formatUnits(raw, 18)).toFixed(4)} ETH` : "…"}
                </span>
                <button
                  className="app-untrack"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setWatched(unwatchWallet(w.address));
                  }}
                >
                  remove
                </button>
              </Link>
            );
          })}
        </div>
      )}

      {watched.length === 0 && (
        <div className="app-empty" style={{ marginTop: 20 }}>
          Not following any wallets yet.
        </div>
      )}
    </>
  );
}

/** A stable, deterministic color per address — same idea as a blockie, without pulling in an image library for it. */
function colorFor(address: string): string {
  let hash = 0;
  for (let i = 2; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 42%)`;
}
