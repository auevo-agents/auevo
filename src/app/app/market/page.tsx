"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "../connect-button";

/**
 * Live new-pairs feed — every Uniswap V3 pool created on Robinhood
 * Chain, newest first, straight from the factory's own event log via
 * Blockscout. This is the terminal's actual front door: token discovery
 * before a trade, not an address you already have to know.
 *
 * No fabricated market cap, liquidity-in-dollars or volume figures:
 * those need either a price feed for the paired token or a dedicated
 * indexer, neither of which exists yet (see the WETH note on Trading).
 * What's shown here — the pair, the fee tier, how old the pool is — is
 * only what can be stated as fact from what the factory itself emitted.
 */

interface Pool {
  pool: string;
  token0: string;
  token1: string;
  fee: number;
  ageSeconds: number | null;
  token0Symbol: string | null;
  token1Symbol: string | null;
}

function formatAge(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function MarketPage() {
  const [pools, setPools] = useState<Pool[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/new-pools");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not load new pairs");
          return;
        }
        setPools(data.pools);
      } catch {
        if (!cancelled) setError("Network error loading new pairs");
      }
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <main className="app-shell">
      <MarketSidebar />

      <div className="product-main app-main">
        <header className="product-header">
          <div>
            <h3>Market</h3>
            <p>New Uniswap V3 pools on Robinhood Chain · live</p>
          </div>
          <ConnectButton />
        </header>

        {error && <p className="error" style={{ marginTop: 16 }}>{error}</p>}

        {!pools && !error && (
          <div className="app-empty">Loading new pairs…</div>
        )}

        {pools && pools.length === 0 && (
          <div className="app-empty">No new pools found yet.</div>
        )}

        {pools && pools.length > 0 && (
          <div className="market-table">
            <div className="market-row market-head">
              <span>PAIR</span>
              <span>FEE</span>
              <span>AGE</span>
              <span>POOL</span>
              <span></span>
            </div>

            {pools.map((p) => (
              <div className="market-row" key={p.pool}>
                <span className="market-pair">
                  {p.token0Symbol ?? shorten(p.token0)} / {p.token1Symbol ?? shorten(p.token1)}
                </span>
                <span>{(p.fee / 10_000).toFixed(2)}%</span>
                <span>{formatAge(p.ageSeconds)}</span>
                <code className="scan-mono">{shorten(p.pool)}</code>
                <span className="market-actions">
                  <Link href={`/scanner?token=${p.token0}`}>scan {p.token0Symbol ?? "0"}</Link>
                  <Link href={`/scanner?token=${p.token1}`}>scan {p.token1Symbol ?? "1"}</Link>
                  <Link
                    href={`/app/trading?tokenIn=${p.token1}&tokenOut=${p.token0}`}
                    className="market-trade-link"
                  >
                    trade
                  </Link>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function MarketSidebar() {
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
        <button className="active">
          <span className="nav-icon nav-bots">
            <i />
          </span>
          <b>Market</b>
        </button>
        <Link href="/app/trading" className="app-nav-link">
          <span className="nav-icon nav-trading">
            <i />
            <i />
            <i />
          </span>
          <b>Trading</b>
        </Link>
        <Link href="/app/bots" className="app-nav-link">
          <span className="nav-icon nav-copy">
            <i />
            <i />
            <i />
          </span>
          <b>Bots</b>
        </Link>
        <Link href="/app/positions" className="app-nav-link">
          <span className="nav-icon nav-position">
            <i />
            <i />
          </span>
          <b>Positions</b>
        </Link>
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
