"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "../connect-button";
import { TradeList } from "../market/trade-list";
import { aggregateWallets, type WalletAgg } from "@/lib/smart-money";
import type { WalletLeaderboardEntry } from "@/lib/indexed-smart-money";
import { formatUsdCompact } from "@/lib/format";
import { CopyableAddress } from "@/app/copyable-address";
import { readWatchedWallets, watchWallet } from "@/lib/watched-wallets";
import type { Trade } from "@/lib/geckoterminal";

/**
 * A wallet leaderboard, not just a big-trades feed — ranked by realized
 * profit on a round-trip we can actually see, everything else counted
 * as accumulation/distribution flow rather than invented as a win or a
 * loss. Three tabs, in order of how good the underlying data is:
 *
 * - ON-CHAIN PNL (default): our own indexer (lib/indexed-smart-money.ts)
 *   — every WETH-paired pool it has reached, priced in exact ETH from
 *   each swap's own signed amounts, no third-party API in the loop.
 *   Still a rolling recent window, not full history (see Smart Money's
 *   own indexer notes on the wallet profile page), but real continuous
 *   coverage rather than one fetch's worth.
 * - TOP WALLETS / LIVE TRADES: the original GeckoTerminal-window
 *   version (lib/smart-money.ts) — only the chain's most active pools,
 *   above the size floor below, USD-approximated. Kept as a second
 *   opinion and because it's the only one with a manual size filter.
 */

const THRESHOLDS = [
  { value: 500, label: "≥ $500" },
  { value: 1_000, label: "≥ $1,000" },
  { value: 5_000, label: "≥ $5,000" },
  { value: 25_000, label: "≥ $25,000" },
];

type View = "wallets" | "trades" | "onchain";

export default function SmartMoneyPage() {
  const [minUsd, setMinUsd] = useState(1_000);
  const [view, setView] = useState<View>("onchain");
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watchedNow, setWatchedNow] = useState<string[]>([]);

  const [onchain, setOnchain] = useState<{ indexed: boolean; swapsConsidered: number; wallets: WalletLeaderboardEntry[] } | null>(
    null
  );
  const [onchainError, setOnchainError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWatchedNow(readWatchedWallets().map((w) => w.address));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/smart-money/indexed");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setOnchainError(data.error ?? "Could not load the on-chain leaderboard");
          return;
        }
        setOnchain(data);
        setOnchainError(null);
      } catch {
        if (!cancelled) setOnchainError("Network error loading the on-chain leaderboard");
      }
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
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
      <header className="product-header product-header--smart-money">
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
          className={view === "onchain" ? "desk-tab active" : "desk-tab"}
          onClick={() => setView("onchain")}
        >
          ON-CHAIN PNL
        </button>
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

      {view === "onchain" && (
        <>
          {onchainError && (
            <p className="error" style={{ marginTop: 4 }}>
              {onchainError}
            </p>
          )}

          {!onchain && !onchainError && <div className="app-empty">Loading…</div>}

          {onchain && !onchain.indexed && (
            <div className="app-empty">The chain indexer isn&apos;t connected yet.</div>
          )}

          {onchain && onchain.indexed && onchain.wallets.length === 0 && (
            <div className="app-empty">No WETH-paired swaps in the indexer&apos;s current window yet.</div>
          )}

          {onchain && onchain.wallets.length > 0 && (
            <>
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
                {onchain.wallets.map((w) => (
                  <OnchainWalletRow
                    key={w.wallet}
                    wallet={w}
                    watched={watchedNow.includes(w.wallet)}
                    onWatch={() => {
                      watchWallet(w.wallet);
                      setWatchedNow((prev) => [...prev, w.wallet]);
                    }}
                  />
                ))}
              </div>
              <p className="desk-note">
                From our own indexer ({onchain.swapsConsidered} swaps considered), priced in exact
                ETH from each swap&apos;s own WETH leg — not a USD approximation, and not limited to
                a handful of pools the way the other two tabs are. Still only a rolling recent
                window, not full history — see the note below.
              </p>
            </>
          )}
        </>
      )}

      {view !== "onchain" && error && (
        <p className="error" style={{ marginTop: 4 }}>
          {error}
        </p>
      )}

      {view !== "onchain" && !trades && !error && <div className="app-empty">Loading trades…</div>}

      {view !== "onchain" && trades && trades.length === 0 && (
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

      {view !== "onchain" && (
        <p className="desk-note">
          Trades come live from{" "}
          <a href="https://www.geckoterminal.com/robinhood/pools" target="_blank" rel="noreferrer">
            GeckoTerminal
          </a>
          , limited to the chain&apos;s most active pools — there is no chain-wide trade
          feed on the free API. Realized PnL and win rate only count a
          token where both a buy and a sell from the same wallet are visible in this
          window; everything else shows up in net flow instead of being guessed at.
          Not a signal to copy blindly — a closed round-trip here can still be a small
          slice of that wallet&apos;s real position. Watched wallets are saved to this
          browser and show up on <Link href="/rwa/app/wallets">Wallets</Link>.
        </p>
      )}
    </>
  );
}

function OnchainWalletRow({
  wallet,
  watched,
  onWatch,
}: {
  wallet: WalletLeaderboardEntry;
  watched: boolean;
  onWatch: () => void;
}) {
  const closed = wallet.wins + wallet.losses;
  const pnlClass = closed === 0 ? "" : wallet.realizedPnlEth > 0 ? "desk-change-pos" : "desk-change-neg";
  const flowClass = wallet.netFlowEth > 0 ? "desk-change-pos" : wallet.netFlowEth < 0 ? "desk-change-neg" : "";

  return (
    <div className="money-row">
      <span>
        <Link href={`/rwa/app/wallets/${wallet.wallet}`}>
          <CopyableAddress address={wallet.wallet} />
        </Link>
      </span>
      <span className="desk-col-right">{wallet.tokensTraded}</span>
      <span className="desk-col-right">{wallet.trades}</span>
      <span className={`desk-col-right ${pnlClass}`} style={{ fontWeight: 500 }}>
        {closed === 0
          ? "—"
          : `${wallet.realizedPnlEth >= 0 ? "+" : "-"}${Math.abs(wallet.realizedPnlEth).toFixed(4)} ETH`}
      </span>
      <span className="desk-col-right">{closed === 0 ? "—" : `${wallet.wins}/${closed}`}</span>
      <span className={`desk-col-right ${flowClass}`}>
        {wallet.netFlowEth >= 0 ? "+" : "-"}
        {Math.abs(wallet.netFlowEth).toFixed(4)} ETH
      </span>
      <span className="desk-actions">
        <button className="app-link-button" onClick={onWatch} disabled={watched}>
          {watched ? "watching" : "+ watch"}
        </button>
        <Link href={`/rwa/app/wallets/${wallet.wallet}`}>profile</Link>
      </span>
    </div>
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
        <CopyableAddress address={wallet.address} />
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
