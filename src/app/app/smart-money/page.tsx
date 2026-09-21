"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "../connect-button";
import { TradeList } from "../market/trade-list";
import type { Trade } from "@/lib/geckoterminal";

/**
 * Large swaps across Robinhood Chain's most active pools — real trades
 * above a size floor, nothing else. Deliberately not a "smart money"
 * wallet score: there is no wallet reputation or skill metric here, no
 * labeling of an address as good or bad. A large trade just means a
 * large trade; the "watch" button hands off to the existing Wallets
 * watchlist for anyone who wants to keep an eye on where it goes next.
 */

const THRESHOLDS = [
  { value: 1_000, label: "≥ $1,000" },
  { value: 5_000, label: "≥ $5,000" },
  { value: 25_000, label: "≥ $25,000" },
  { value: 100_000, label: "≥ $100,000" },
];

export default function SmartMoneyPage() {
  const [minUsd, setMinUsd] = useState(5_000);
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTrades(null);

    async function load() {
      try {
        const res = await fetch(`/api/smart-money?minUsd=${minUsd}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not load trade data");
          return;
        }
        setTrades(data.trades);
        setError(null);
      } catch {
        if (!cancelled) setError("Network error loading trade data");
      }
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [minUsd]);

  return (
    <>
      <header className="product-header">
        <div>
          <h3>Smart Money</h3>
          <p>Large swaps across Robinhood Chain, live · no wallet scoring</p>
        </div>
        <ConnectButton />
      </header>

      <div className="desk-tabs">
        {THRESHOLDS.map((t) => (
          <button
            key={t.value}
            className={minUsd === t.value ? "desk-tab active" : "desk-tab"}
            onClick={() => setMinUsd(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="error" style={{ marginTop: 4 }}>
          {error}
        </p>
      )}

      {!trades && !error && <div className="app-empty">Loading trades…</div>}

      {trades && trades.length === 0 && (
        <div className="app-empty">
          No trades at or above {THRESHOLDS.find((t) => t.value === minUsd)?.label} in the
          last 24h across the most active pools.
        </div>
      )}

      {trades && trades.length > 0 && <TradeList trades={trades} showPair />}

      <p className="desk-note">
        Trades come live from{" "}
        <a href="https://www.geckoterminal.com/robinhood/pools" target="_blank" rel="noreferrer">
          GeckoTerminal
        </a>
        , limited to the chain&apos;s most active pools (there is no chain-wide trade
        feed on the free API). A large trade is not a signal to copy — it is just a
        fact about size. Watched wallets are saved to this browser and show up on{" "}
        <Link href="/app/wallets">Wallets</Link>.
      </p>
    </>
  );
}
