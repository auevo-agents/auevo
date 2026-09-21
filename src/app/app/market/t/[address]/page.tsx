"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "../../../connect-button";
import { SwapPanel } from "../../../swap-panel";
import { CandlestickChart } from "../../candlestick-chart";
import { TradeList } from "../../trade-list";
import { TokenInfoPanel } from "../../token-info-panel";
import {
  formatAge,
  formatPercent,
  formatPrice,
  formatUsdCompact,
  shortenAddress,
} from "@/lib/format";
import type { Candle, MarketPool, OhlcvTimeframe, Trade } from "@/lib/geckoterminal";

/**
 * Token/pool detail — the "click a pair" page from Market. Everything
 * shown is real, live data from the same GeckoTerminal source as the
 * Market list (see src/lib/geckoterminal.ts): a live interactive chart
 * (TradingView's lightweight-charts, not a static image), this pool's
 * own recent trades, and a real embedded swap panel (shared with Trading
 * — see ../../../swap-panel.tsx — rather than a second copy of the swap
 * logic). No Limit/Ladder/Martingale order types: there is no on-chain
 * infrastructure behind those here (no limit-order book, no bot
 * executor), so showing those tabs would advertise a capability that
 * doesn't exist.
 */

const CHART_TABS: {
  id: string;
  label: string;
  timeframe: OhlcvTimeframe;
  aggregate: number;
}[] = [
  { id: "5m", label: "5M", timeframe: "minute", aggregate: 5 },
  { id: "15m", label: "15M", timeframe: "minute", aggregate: 15 },
  { id: "1h", label: "1H", timeframe: "hour", aggregate: 1 },
  { id: "4h", label: "4H", timeframe: "hour", aggregate: 4 },
  { id: "1d", label: "1D", timeframe: "day", aggregate: 1 },
];

const TRADE_FILTERS = [
  { value: 0, label: "ALL" },
  { value: 500, label: "≥ $500" },
  { value: 2_500, label: "≥ $2,500" },
  { value: 10_000, label: "≥ $10,000" },
];

function changeClass(value: number | null): string {
  if (value === null || value === 0) return "";
  return value > 0 ? "desk-change-pos" : "desk-change-neg";
}

function McapValue({ pool }: { pool: MarketPool }) {
  if (pool.marketCapUsd !== null) return <>{formatUsdCompact(pool.marketCapUsd)}</>;
  if (pool.fdvUsd !== null) {
    return (
      <>
        {formatUsdCompact(pool.fdvUsd)}{" "}
        <small style={{ color: "#5a6469", fontWeight: 400 }}>FDV</small>
      </>
    );
  }
  return <>—</>;
}

export default function TokenDetailPage(props: PageProps<"/app/market/t/[address]">) {
  const { address } = use(props.params);

  const [pool, setPool] = useState<MarketPool | null | undefined>(undefined);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [chartTabId, setChartTabId] = useState("1h");
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [tradesMinUsd, setTradesMinUsd] = useState(0);
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [tradesError, setTradesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/market/pool/${address}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setPool(null);
          setPoolError(data.error ?? "Pool not found");
          return;
        }
        setPool(data.pool);
        setPoolError(null);
      } catch {
        if (!cancelled) {
          setPool(null);
          setPoolError("Network error loading this pool");
        }
      }
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [address]);

  const chartTab = CHART_TABS.find((t) => t.id === chartTabId) ?? CHART_TABS[2];

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCandles(null); // clears the previous timeframe's chart while the new one loads

    async function loadChart() {
      try {
        const res = await fetch(
          `/api/market/ohlcv/${address}?timeframe=${chartTab.timeframe}&aggregate=${chartTab.aggregate}`
        );
        const data = await res.json();
        if (!cancelled && res.ok) setCandles(data.candles);
      } catch {
        // Chart failing to load isn't fatal to the rest of the page.
      }
    }

    loadChart();
    const interval = setInterval(loadChart, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [address, chartTab.timeframe, chartTab.aggregate]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTrades(null);

    async function loadTrades() {
      try {
        const res = await fetch(`/api/market/trades/${address}?minUsd=${tradesMinUsd}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setTradesError(data.error ?? "Could not load trades");
          return;
        }
        setTrades(data.trades);
        setTradesError(null);
      } catch {
        if (!cancelled) setTradesError("Network error loading trades");
      }
    }

    loadTrades();
    const interval = setInterval(loadTrades, 20_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [address, tradesMinUsd]);

  function copyAddress() {
    const tokenAddress = pool?.baseToken.address;
    if (!tokenAddress) return;
    navigator.clipboard
      ?.writeText(tokenAddress)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  return (
    <>
      <header className="product-header">
        <div>
          <h3>Token</h3>
          <p>Pool detail · Robinhood Chain</p>
        </div>
        <ConnectButton />
      </header>

      <Link href="/app/market" className="token-back">
        ← Back to Market
      </Link>

      {pool === undefined && !poolError && (
        <div className="app-empty" style={{ marginTop: 20 }}>
          Loading…
        </div>
      )}

      {pool === null && (
        <div className="app-empty" style={{ marginTop: 20 }}>
          {poolError ?? "Pool not found."}
        </div>
      )}

      {pool && (
        <>
          <div className="token-detail-header">
            <div className="token-detail-identity">
              {pool.baseToken.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pool.baseToken.imageUrl} alt="" className="token-detail-icon" />
              ) : (
                <span className="token-detail-icon" />
              )}

              <div className="token-detail-name">
                <strong>
                  {pool.baseToken.symbol ?? "Unknown"} / {pool.quoteToken.symbol ?? "?"}
                </strong>
                <span>
                  {pool.baseToken.name ?? "Unnamed token"} · {pool.dexName ?? "Uniswap V3"} ·
                  pool age {formatAge(pool.ageSeconds)}
                </span>

                {pool.baseToken.address && (
                  <div className="token-detail-address">
                    <code className="scan-mono">
                      {shortenAddress(pool.baseToken.address, 10, 8)}
                    </code>
                    <button onClick={copyAddress}>{copied ? "copied" : "copy"}</button>
                  </div>
                )}

                <div className="token-detail-links">
                  {pool.baseToken.address && (
                    <Link href={`/scanner?token=${pool.baseToken.address}`}>
                      Run Token Scanner →
                    </Link>
                  )}
                  <a
                    href={`https://robinhoodchain.blockscout.com/address/${
                      pool.baseToken.address ?? pool.poolAddress ?? ""
                    }`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on Blockscout ↗
                  </a>
                </div>
              </div>
            </div>

            <div className="token-detail-price">
              <strong>{formatPrice(pool.priceUsd)}</strong>
              <span className={changeClass(pool.change.h24)}>
                {formatPercent(pool.change.h24)} · 24h
              </span>
            </div>
          </div>

          <div className="token-detail-grid">
            <div className="token-chart-card">
              <div className="token-chart-tabs">
                {CHART_TABS.map((t) => (
                  <button
                    key={t.id}
                    className={chartTabId === t.id ? "token-chart-tab active" : "token-chart-tab"}
                    onClick={() => setChartTabId(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {candles === null ? (
                <div className="app-empty">Loading chart…</div>
              ) : candles.length === 0 ? (
                <div className="app-empty">No chart data yet for this timeframe.</div>
              ) : (
                <CandlestickChart candles={candles} />
              )}

              <div className="token-stat-grid">
                <div className="token-stat">
                  <span>LIQUIDITY</span>
                  <strong>{formatUsdCompact(pool.liquidityUsd)}</strong>
                </div>
                <div className="token-stat">
                  <span>MARKET CAP</span>
                  <strong>
                    <McapValue pool={pool} />
                  </strong>
                </div>
                <div className="token-stat">
                  <span>VOLUME 24H</span>
                  <strong>{formatUsdCompact(pool.volumeUsd24h)}</strong>
                </div>
                <div className="token-stat">
                  <span>TXNS 24H</span>
                  <strong>
                    {pool.txns24h
                      ? `${pool.txns24h.buys ?? 0} buys / ${pool.txns24h.sells ?? 0} sells`
                      : "—"}
                  </strong>
                </div>
                <div className="token-stat">
                  <span>5M</span>
                  <strong className={changeClass(pool.change.m5)}>
                    {formatPercent(pool.change.m5)}
                  </strong>
                </div>
                <div className="token-stat">
                  <span>1H</span>
                  <strong className={changeClass(pool.change.h1)}>
                    {formatPercent(pool.change.h1)}
                  </strong>
                </div>
                <div className="token-stat">
                  <span>6H</span>
                  <strong className={changeClass(pool.change.h6)}>
                    {formatPercent(pool.change.h6)}
                  </strong>
                </div>
                <div className="token-stat">
                  <span>24H</span>
                  <strong className={changeClass(pool.change.h24)}>
                    {formatPercent(pool.change.h24)}
                  </strong>
                </div>
              </div>
            </div>

            <div>
              <div className="token-side-card">
                <h4>Trade</h4>
                <p>
                  Routed through Uniswap&apos;s own SwapRouter02 — you approve and sign
                  every step yourself in your own wallet; nothing here custodies funds.
                  Market orders only here — no ladders or martingale strategies. For
                  recurring buys, see <Link href="/app/bots">Bots</Link>; limit orders
                  aren&apos;t wired up yet, even though Uniswap X supports them on this
                  chain — that&apos;s next, not faked here in the meantime.
                </p>
                {pool.baseToken.address && pool.quoteToken.address ? (
                  <SwapPanel
                    initialTokenIn={pool.quoteToken.address}
                    initialTokenOut={pool.baseToken.address}
                    lockPair
                  />
                ) : (
                  <p>Token address unavailable — can&apos;t trade this pair here.</p>
                )}
              </div>

              {pool.baseToken.address && <TokenInfoPanel tokenAddress={pool.baseToken.address} />}
            </div>
          </div>

          <div className="token-trades-section">
            <div className="scan-section-heading">
              <span>LIVE</span>
              <strong>Recent trades — this pool</strong>
            </div>

            <div className="desk-tabs">
              {TRADE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  className={tradesMinUsd === f.value ? "desk-tab active" : "desk-tab"}
                  onClick={() => setTradesMinUsd(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {tradesError && <p className="error">{tradesError}</p>}
            {!trades && !tradesError && <div className="app-empty">Loading trades…</div>}
            {trades && trades.length === 0 && (
              <div className="app-empty">No trades at this size in the last 24h.</div>
            )}
            {trades && trades.length > 0 && <TradeList trades={trades} showPair={false} />}
          </div>
        </>
      )}
    </>
  );
}
