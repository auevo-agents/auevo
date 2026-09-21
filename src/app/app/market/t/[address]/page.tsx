"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "../../../connect-button";
import { CandlestickChart } from "../../candlestick-chart";
import {
  formatAge,
  formatPercent,
  formatPrice,
  formatUsdCompact,
  shortenAddress,
} from "@/lib/format";
import type { Candle, MarketPool, OhlcvTimeframe } from "@/lib/geckoterminal";

/**
 * Token/pool detail — the "click a pair" page from Market. Everything
 * shown is real, live data from the same GeckoTerminal source as the
 * Market list (see src/lib/geckoterminal.ts), plus a link into the real
 * Token Scanner for an actual security read.
 *
 * Deliberately does not reimplement the swap form here: Trading already
 * has a real, working Uniswap V3 swap flow (approve + exactInputSingle),
 * and a second copy of that logic is a second place for a bug in
 * money-moving code to hide. This links into it prefilled instead. It
 * also does not offer Limit/Ladder/Martingale order types — there is no
 * on-chain infrastructure behind those here (no limit-order book, no bot
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
                  Swaps route through Uniswap&apos;s own SwapRouter02 — you approve and
                  sign every step yourself in your own wallet; nothing here custodies
                  funds. No limit orders, ladders or martingale strategies exist behind
                  this yet — only a direct market swap.
                </p>
                {pool.baseToken.address && pool.quoteToken.address ? (
                  <Link
                    href={`/app/trading?tokenIn=${pool.quoteToken.address}&tokenOut=${pool.baseToken.address}`}
                    className="app-connect-button"
                    style={{
                      display: "inline-block",
                      marginTop: 14,
                      textDecoration: "none",
                      textAlign: "center",
                    }}
                  >
                    Trade {pool.baseToken.symbol ?? "token"} →
                  </Link>
                ) : (
                  <p>Token address unavailable — can&apos;t prefill a trade.</p>
                )}
              </div>

              <div className="token-side-card">
                <h4>About this data</h4>
                <p>
                  Price, chart, liquidity, volume and market cap are read live from
                  GeckoTerminal&apos;s public DEX API, not computed by us. No safety
                  verdict is shown or implied here — this page does not say whether{" "}
                  {pool.baseToken.symbol ?? "this token"} is safe to hold.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
