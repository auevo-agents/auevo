"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "../connect-button";
import { TradeList } from "../market/trade-list";
import { aggregateWallets, type WalletAgg } from "@/lib/smart-money";
import { formatUsdCompact, shortenAddress } from "@/lib/format";
import { readWatchedWallets, watchWallet } from "@/lib/watched-wallets";
import type { Trade } from "@/lib/geckoterminal";

/**
 * A wallet leaderboard, not just a big-trades feed — ranked by realized
 * profit on a round-trip we can actually see (a buy and a sell of the
 * same token, both inside the fetched window), everything else counted
 * as accumulation/distribution flow rather than invented as a win or a
 * loss. See lib/smart-money.ts for exactly what that does and doesn't
 * claim: this is not Nansen/GMGN-style lifetime PnL off a full-chain
 * indexer — those track every wallet's entire history continuously; we
 * only see whatever trades this fetch pulled from the most active pools
 * above the size floor below. Raise the floor and you see fewer, bigger
 * players; lower it and you see more wallets but more trades where only
 * one side of a round-trip is visible.
 */

const THRESHOLDS = [
  { value: 500, label: "≥ $500" },
  { value: 1_000, label: "≥ $1,000" },
  { value: 5_000, label: "≥ $5,000" },
  { value: 25_000, label: "≥ $25,000" },
];

type View = "wallets" | "trades";

export default function SmartMoneyPage() {
  const [minUsd, setMinUsd] = useState(1_000);
  const [view, setView] = useState<View>("wallets");
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watchedNow, setWatchedNow] = useState<string[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWatchedNow(readWatchedWallets());
  }, []);

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

  const wallets = useMemo(() => (trades ? aggregateWallets(trades) : null), [trades]);

  return (
    <>
      <header className="product-header">
        <div>
          <h3>Smart Money</h3>
          <p>Wallet leaderboard, ranked by realized profit this window · Robinhood Chain</p>
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

      <div className="desk-tabs" style={{ marginTop: 8 }}>
        <button
          className={view === "wallets" ? "desk-tab active" : "desk-tab"}
          onClick={() => setView("wallets")}
        >
          TOP WALLETS
        </button>
        <button
          className={view === "trades" ? "desk-tab active" : "desk-tab"}
          onClick={() => setView("trades")}
        >
          LIVE TRADES
        </button>
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

      {view === "wallets" && wallets && wallets.length > 0 && (
        <div className="desk-scroll">
          <div className="money-row money-head">
            <span>WALLET</span>
            <span className="desk-col-right">TOKENS</span>
            <span className="desk-col-right">TRADES</span>
            <span className="desk-col-right">REALIZED PNL</span>
            <span className="desk-col-right">WIN RATE</span>
            <span className="desk-col-right">NET FLOW</span>
            <span />
          </div>
          {wallets.slice(0, 25).map((w) => (
            <WalletRow
              key={w.address}
              wallet={w}
              watched={watchedNow.includes(w.address)}
              onWatch={() => {
                watchWallet(w.address);
                setWatchedNow((prev) => [...prev, w.address]);
              }}
            />
          ))}
        </div>
      )}

      {view === "trades" && trades && trades.length > 0 && (
        <TradeList trades={trades} showPair />
      )}

      <p className="desk-note">
        Trades come live from{" "}
        <a href="https://www.geckoterminal.com/robinhood/pools" target="_blank" rel="noreferrer">
          GeckoTerminal
        </a>
        , limited to the chain&apos;s most active pools — there is no chain-wide trade
        feed on the free API, and no continuous per-wallet history the way a paid
        indexer (Nansen, GMGN) would give you. Realized PnL and win rate only count a
        token where both a buy and a sell from the same wallet are visible in this
        window; everything else shows up in net flow instead of being guessed at.
        Not a signal to copy blindly — a closed round-trip here can still be a small
        slice of that wallet&apos;s real position. Watched wallets are saved to this
        browser and show up on <Link href="/app/wallets">Wallets</Link>.
      </p>
    </>
  );
}

function WalletRow({
  wallet,
  watched,
  onWatch,
}: {
  wallet: WalletAgg;
  watched: boolean;
  onWatch: () => void;
}) {
  const closed = wallet.wins + wallet.losses;
  const pnlClass = closed === 0 ? "" : wallet.realizedPnlUsd > 0 ? "desk-change-pos" : "desk-change-neg";
  const flowClass = wallet.netFlowUsd > 0 ? "desk-change-pos" : wallet.netFlowUsd < 0 ? "desk-change-neg" : "";

  return (
    <div className="money-row">
      <span>
        <code className="scan-mono">{shortenAddress(wallet.address)}</code>
      </span>
      <span className="desk-col-right">{wallet.tokens}</span>
      <span className="desk-col-right">{wallet.trades}</span>
      <span className={`desk-col-right ${pnlClass}`} style={{ fontWeight: 500 }}>
        {closed === 0
          ? "—"
          : `${wallet.realizedPnlUsd >= 0 ? "+" : "-"}${formatUsdCompact(Math.abs(wallet.realizedPnlUsd))}`}
      </span>
      <span className="desk-col-right">{closed === 0 ? "—" : `${wallet.wins}/${closed}`}</span>
      <span className={`desk-col-right ${flowClass}`}>
        {wallet.netFlowUsd >= 0 ? "+" : "-"}
        {formatUsdCompact(Math.abs(wallet.netFlowUsd))}
      </span>
      <span className="desk-actions">
        <button className="app-link-button" onClick={onWatch} disabled={watched}>
          {watched ? "watching" : "+ watch"}
        </button>
        <a
          href={`https://robinhoodchain.blockscout.com/address/${wallet.address}`}
          target="_blank"
          rel="noreferrer"
        >
          view
        </a>
      </span>
    </div>
  );
}
