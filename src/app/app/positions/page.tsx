"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useBalance, useReadContracts } from "wagmi";
import { robinhoodChain } from "@/lib/chains";
import { ConnectButton } from "../connect-button";

/**
 * Real holdings for the connected wallet — native balance plus a small
 * set of tracked ERC-20s. Fully read-only: no funds pass through us.
 *
 * There is no token list for Robinhood Chain wired up yet (nothing this
 * codebase has built or verified provides one), so tracked tokens are
 * entered by address rather than auto-discovered. That is a real
 * limitation, stated rather than papered over with a hardcoded list of
 * addresses nobody has confirmed.
 */

const ERC20_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const STORAGE_KEY = "auevo.trackedTokens";

export default function PositionsPage() {
  const { address, isConnected } = useAccount();
  const native = useBalance({
    address,
    chainId: robinhoodChain.id,
    query: { enabled: Boolean(address) },
  });

  const [tracked, setTracked] = useState<string[]>([]);
  const [newToken, setNewToken] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setTracked(JSON.parse(raw));
    } catch {
      // localStorage unavailable (private window, blocked) — start empty.
    }
  }, []);

  function persist(next: string[]) {
    setTracked(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Best-effort only — the list still works for this page load.
    }
  }

  const contracts = useReadContracts({
    allowFailure: true,
    contracts: tracked.flatMap((token) => [
      { address: token as `0x${string}`, abi: ERC20_ABI, functionName: "symbol" } as const,
      { address: token as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" } as const,
      address
        ? ({
            address: token as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address],
          } as const)
        : (undefined as never),
    ]),
    query: { enabled: tracked.length > 0 },
  });

  return (
    <main className="app-shell">
      <PositionsSidebar />

      <div className="product-main app-main">
        <header className="product-header">
          <div>
            <h3>Positions</h3>
            <p>What the connected wallet holds on Robinhood Chain</p>
          </div>
          <ConnectButton />
        </header>

        {!isConnected ? (
          <div className="app-empty">Connect a wallet above to see positions.</div>
        ) : (
          <>
            <div className="app-kpis" style={{ marginTop: 20 }}>
              <article className="app-kpi">
                <span>NATIVE BALANCE</span>
                <strong>
                  {native.data
                    ? `${Number(
                        formatUnits(native.data.value, native.data.decimals)
                      ).toFixed(4)} ${native.data.symbol}`
                    : "—"}
                </strong>
              </article>
            </div>

            <div className="app-tools">
              <div className="scan-section-heading">
                <span>TRACKED TOKENS</span>
                <strong>Add any ERC-20 by address to watch its balance</strong>
              </div>

              <div className="trade-field" style={{ maxWidth: 420 }}>
                <span>Token contract address</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={newToken}
                    onChange={(e) => setNewToken(e.target.value.trim())}
                    placeholder="0x…"
                    spellCheck={false}
                  />
                  <button
                    className="app-connect-button"
                    onClick={() => {
                      if (newToken && !tracked.includes(newToken)) {
                        persist([...tracked, newToken]);
                        setNewToken("");
                      }
                    }}
                  >
                    Track
                  </button>
                </div>
              </div>

              {tracked.length > 0 && (
                <div className="scan-holder-table" style={{ marginTop: 16 }}>
                  {tracked.map((token, i) => {
                    const symbol = contracts.data?.[i * 3]?.result as string | undefined;
                    const decimals = contracts.data?.[i * 3 + 1]?.result as
                      | number
                      | undefined;
                    const balance = contracts.data?.[i * 3 + 2]?.result as
                      | bigint
                      | undefined;

                    return (
                      <div className="scan-holder-row" key={token} style={{ gridTemplateColumns: "1fr auto auto" }}>
                        <code className="scan-mono">
                          {symbol ?? `${token.slice(0, 6)}…${token.slice(-4)}`}
                        </code>
                        <span>
                          {balance !== undefined && decimals !== undefined
                            ? Number(formatUnits(balance, decimals)).toFixed(4)
                            : "…"}
                        </span>
                        <button
                          className="app-untrack"
                          onClick={() => persist(tracked.filter((t) => t !== token))}
                        >
                          remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function PositionsSidebar() {
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
        <Link href="/app/trading" className="app-nav-link">
          <span className="nav-icon nav-trading">
            <i />
            <i />
            <i />
          </span>
          <b>Trading</b>
        </Link>
        <button className="active">
          <span className="nav-icon nav-position">
            <i />
            <i />
          </span>
          <b>Positions</b>
        </button>
        <Link href="/app/wallets" className="app-nav-link">
          <span className="nav-icon nav-wallet">
            <i />
          </span>
          <b>Wallets</b>
        </Link>
      </nav>
    </aside>
  );
}
