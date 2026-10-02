"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "../../../connect-button";
import { SwapPanel } from "../../../swap-panel";
import { CandlestickChart } from "../../candlestick-chart";
import { TradeList } from "../../trade-list";
import { TokenInfoPanel } from "../../token-info-panel";
import { FavoriteStar } from "../../favorite-star";
import { useTokenScan } from "../../use-token-scan";
import { CopyableAddress } from "@/app/copyable-address";
import {
  formatAge,
  formatPercent,
  formatPrice,
  formatUsdCompact,
  shortenAddress,
} from "@/lib/format";
import type { Candle, MarketPool, OhlcvTimeframe, Trade, TokenInfo } from "@/lib/geckoterminal";
import { formatUnits } from "viem";

/**
 * Token/pool detail — the "click a pair" page from Market. Everything
 * shown is real, live data: a live interactive chart (TradingView's
 * lightweight-charts), this pool's own trades (and two views derived
 * from the same fetch — Top Traders and, once scanned, Holders — rather
 * than separate heavy calls), a real embedded swap panel, and Token Info
 * driven by an on-demand scan rather than one fired automatically on
 * every page view (that was the main thing making this page feel slow).
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

type Section = "trades" | "traders" | "holders" | "orders" | "info";

const SECTION_TABS: { id: Section; label: string }[] = [
  { id: "trades", label: "TRADES" },
  { id: "traders", label: "TOP TRADERS" },
  { id: "holders", label: "HOLDERS" },
  { id: "orders", label: "MY ORDERS" },
  { id: "info", label: "INFO" },
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

interface TraderAgg {
  address: string;
  volumeUsd: number;
  trades: number;
  buys: number;
  sells: number;
}

function aggregateTopTraders(trades: Trade[]): TraderAgg[] {
  const byAddress = new Map<string, TraderAgg>();
  for (const t of trades) {
    if (!t.traderAddress) continue;
    const entry = byAddress.get(t.traderAddress) ?? {
      address: t.traderAddress,
      volumeUsd: 0,
      trades: 0,
      buys: 0,
      sells: 0,
    };
    entry.volumeUsd += t.volumeUsd ?? 0;
    entry.trades += 1;
    if (t.kind === "buy") entry.buys += 1;
    if (t.kind === "sell") entry.sells += 1;
    byAddress.set(t.traderAddress, entry);
  }
  return [...byAddress.values()].sort((a, b) => b.volumeUsd - a.volumeUsd).slice(0, 15);
}

interface Pulse {
  volumeUsd: number;
  buys: number;
  sells: number;
  netVolumeUsd: number;
}

const PULSE_WINDOW_SECONDS = 5 * 60;

/**
 * Trailing-5-minute activity, the same quick momentum read every leader
 * terminal shows next to Buy/Sell — computed from the trades already
 * being polled for the Trades/Top Traders tabs rather than a separate
 * call. ageSeconds is a snapshot from whenever this trade batch was last
 * fetched (polled every 20s), so this is accurate to within one poll,
 * not tick-by-tick live.
 */
function fiveMinutePulse(trades: Trade[]): Pulse {
  let volumeUsd = 0;
  let buys = 0;
  let sells = 0;
  let buyVolumeUsd = 0;
  let sellVolumeUsd = 0;

  for (const t of trades) {
    if (t.ageSeconds === null || t.ageSeconds > PULSE_WINDOW_SECONDS) continue;
    const v = t.volumeUsd ?? 0;
    volumeUsd += v;
    if (t.kind === "buy") {
      buys += 1;
      buyVolumeUsd += v;
    } else if (t.kind === "sell") {
      sells += 1;
      sellVolumeUsd += v;
    }
  }

  return { volumeUsd, buys, sells, netVolumeUsd: buyVolumeUsd - sellVolumeUsd };
}

function copyToClipboard(value: string, onDone: () => void) {
  navigator.clipboard?.writeText(value).then(onDone).catch(() => {});
}

export default function TokenDetailPage(props: PageProps<"/rwa/app/market/t/[address]">) {
  const { address } = use(props.params);

  const [pool, setPool] = useState<MarketPool | null | undefined>(undefined);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [chartTabId, setChartTabId] = useState("1h");
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("trades");
  const [tradesMinUsd, setTradesMinUsd] = useState(0);
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [tradesError, setTradesError] = useState<string | null>(null);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null | undefined>(undefined);

  const scan = useTokenScan(pool?.baseToken.address ?? "");

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

  // Fetched unfiltered (minUsd=0) once per pool — the Trades tab's size
  // filter and the Top Traders tab's ranking are both derived from this
  // same set client-side, instead of two separate calls.
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTrades(null);

    async function loadTrades() {
      try {
        const res = await fetch(`/api/market/trades/${address}`);
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
  }, [address]);

  // Info tab's socials are cheap but still a network call — fetched only
  // once the tab is actually opened, same "nothing loads until asked
  // for" rule as the security scan.
  useEffect(() => {
    if (section !== "info" || tokenInfo !== undefined || !pool?.baseToken.address) return;
    let cancelled = false;

    fetch(`/api/market/token-info/${pool.baseToken.address}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setTokenInfo(data.info ?? null);
      })
      .catch(() => {
        if (!cancelled) setTokenInfo(null);
      });

    return () => {
      cancelled = true;
    };
  }, [section, tokenInfo, pool?.baseToken.address]);

  const filteredTrades = useMemo(() => {
    if (!trades) return null;
    return tradesMinUsd === 0
      ? trades
      : trades.filter((t) => (t.volumeUsd ?? 0) >= tradesMinUsd);
  }, [trades, tradesMinUsd]);

  const topTraders = useMemo(() => (trades ? aggregateTopTraders(trades) : null), [trades]);
  const pulse = useMemo(() => (trades ? fiveMinutePulse(trades) : null), [trades]);

  function copyField(field: string, value: string) {
    copyToClipboard(value, () => {
      setCopiedField(field);
      setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 1500);
    });
  }

  return (
    <>
      <header className="product-header product-header--market">
        <div>
          <h3>Token</h3>
          <p>Pool detail · Robinhood Chain</p>
        </div>
        <ConnectButton />
      </header>

      <Link href="/rwa/app/market" className="token-back">
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
                  {pool.poolAddress && (
                    <span style={{ marginRight: 8 }}>
                      <FavoriteStar poolAddress={pool.poolAddress} />
                    </span>
                  )}
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
                    <button onClick={() => copyField("header", pool.baseToken.address as string)}>
                      {copiedField === "header" ? "copied" : "copy"}
                    </button>
                  </div>
                )}

                <div className="token-detail-links">
                  {pool.baseToken.address && (
                    <Link href={`/scanner?token=${pool.baseToken.address}`}>
                      Run Token Scanner
                    </Link>
                  )}
                  <a
                    href={`https://robinhoodchain.blockscout.com/address/${
                      pool.baseToken.address ?? pool.poolAddress ?? ""
                    }`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on Blockscout
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

            <div className="token-side-column">
              <div className="token-side-card">
                <h4>Trade</h4>
                {pulse && (
                  <div className="token-pulse">
                    <div className="token-pulse-item">
                      <span>5M VOL</span>
                      <strong>{formatUsdCompact(pulse.volumeUsd)}</strong>
                    </div>
                    <div className="token-pulse-item">
                      <span>BUYS</span>
                      <strong className="token-pulse-buy">{pulse.buys}</strong>
                    </div>
                    <div className="token-pulse-item">
                      <span>SELLS</span>
                      <strong className="token-pulse-sell">{pulse.sells}</strong>
                    </div>
                    <div className="token-pulse-item">
                      <span>NET VOL</span>
                      <strong className={changeClass(pulse.netVolumeUsd)}>
                        {pulse.netVolumeUsd >= 0 ? "+" : "-"}
                        {formatUsdCompact(Math.abs(pulse.netVolumeUsd))}
                      </strong>
                    </div>
                  </div>
                )}
                <p>
                  Routed through Uniswap&apos;s own SwapRouter02 — you approve and sign
                  every step yourself in your own wallet; nothing here custodies funds.
                  Market orders only here — no ladders or martingale strategies. For
                  recurring buys, see <Link href="/rwa/app/bots">Bots</Link>; limit orders
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

              {pool.baseToken.address && (
                <TokenInfoPanel
                  tokenAddress={pool.baseToken.address}
                  status={scan.status}
                  report={scan.report}
                  onScan={scan.run}
                />
              )}
            </div>
          </div>

          <div className="token-trades-section">
            <div className="desk-tabs">
              {SECTION_TABS.map((t) => (
                <button
                  key={t.id}
                  className={section === t.id ? "desk-tab active" : "desk-tab"}
                  onClick={() => setSection(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {section === "trades" && (
              <>
                <div className="desk-tabs" style={{ marginTop: 0, marginBottom: 12, borderBottom: "none" }}>
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
                {!filteredTrades && !tradesError && <div className="app-empty">Loading trades…</div>}
                {filteredTrades && filteredTrades.length === 0 && (
                  <div className="app-empty">No trades at this size in the last 24h.</div>
                )}
                {filteredTrades && filteredTrades.length > 0 && (
                  <TradeList trades={filteredTrades} showPair={false} />
                )}
              </>
            )}

            {section === "traders" && (
              <>
                {!topTraders && <div className="app-empty">Loading trades…</div>}
                {topTraders && topTraders.length === 0 && (
                  <div className="app-empty">No trades in the last 24h to rank.</div>
                )}
                {topTraders && topTraders.length > 0 && (
                  <div className="desk-scroll">
                    <div className="rank-row rank-head">
                      <span>#</span>
                      <span>TRADER</span>
                      <span className="desk-col-right">VOLUME (24H)</span>
                      <span className="desk-col-right">TRADES</span>
                      <span />
                    </div>
                    {topTraders.map((t, i) => (
                      <div className="rank-row" key={t.address}>
                        <span>{i + 1}</span>
                        <CopyableAddress address={t.address} />
                        <span className="desk-col-right">{formatUsdCompact(t.volumeUsd)}</span>
                        <span className="desk-col-right">
                          {t.trades} ({t.buys}/{t.sells})
                        </span>
                        <span className="desk-actions">
                          <a
                            href={`https://robinhoodchain.blockscout.com/address/${t.address}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            view
                          </a>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="desk-note">
                  Ranked by trade volume in this pool over the last 24h (up to the
                  most recent 300 trades) — not an all-time or cross-pool ranking.
                </p>
              </>
            )}

            {section === "holders" && (
              <HoldersSection scan={scan} />
            )}

            {section === "orders" && (
              <div className="app-empty app-empty-text">
                <p>No open orders. Swaps here execute immediately as market orders —
                  there&apos;s no resting-order book behind this yet.</p>
                <p>Uniswap X supports real (zero-gas, filler-network) limit orders on
                  this chain; wiring that up here is next, not something to fake in
                  the meantime.</p>
              </div>
            )}

            {section === "info" && pool && (
              <InfoSection pool={pool} tokenInfo={tokenInfo} onCopy={copyField} copiedField={copiedField} />
            )}
          </div>
        </>
      )}
    </>
  );
}

function HoldersSection({ scan }: { scan: ReturnType<typeof useTokenScan> }) {
  if (scan.status === "idle") {
    return (
      <div className="app-empty app-empty-text">
        <p>Not scanned yet — holder distribution comes from the same security scan as Token Info.</p>
        <button className="app-link-button" onClick={scan.run}>
          Run security scan
        </button>
      </div>
    );
  }
  if (scan.status === "loading") {
    return (
      <div className="app-empty">
        <span className="loader" style={{ marginRight: 8 }} />
        Scanning holders…
      </div>
    );
  }
  if (scan.status === "error" || !scan.report) {
    return <div className="app-empty">Could not load holder data right now.</div>;
  }

  const { holders, token } = scan.report;
  if (!holders || holders.top.length === 0) {
    return <div className="app-empty">No holder data available for this token.</div>;
  }

  return (
    <>
      <div className="desk-scroll">
        <div className="rank-row rank-head">
          <span>#</span>
          <span>HOLDER</span>
          <span className="desk-col-right">BALANCE</span>
          <span className="desk-col-right">% SUPPLY</span>
          <span />
        </div>
        {holders.top.map((h, i) => (
          <div className="rank-row" key={h.address}>
            <span>{i + 1}</span>
            <CopyableAddress address={h.address} />
            <span className="desk-col-right">
              {typeof token.decimals === "number"
                ? Number(formatUnits(BigInt(h.balance), token.decimals)).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })
                : h.balance}
            </span>
            <span className="desk-col-right">{h.percent.toFixed(2)}%</span>
            <span className="desk-actions">
              <a
                href={`https://robinhoodchain.blockscout.com/address/${h.address}`}
                target="_blank"
                rel="noreferrer"
              >
                view
              </a>
            </span>
          </div>
        ))}
      </div>
      <p className="desk-note">
        {holders.partial
          ? "Gathered from a partial block range — a larger holder may exist outside it."
          : "Gathered from this token's full history."}{" "}
        Top-10 concentration: {holders.top10Percent.toFixed(1)}%.
      </p>
    </>
  );
}

function InfoSection({
  pool,
  tokenInfo,
  onCopy,
  copiedField,
}: {
  pool: MarketPool;
  tokenInfo: TokenInfo | null | undefined;
  onCopy: (field: string, value: string) => void;
  copiedField: string | null;
}) {
  const rows: { label: string; value: string | null }[] = [
    { label: "TOKEN", value: pool.baseToken.address },
    { label: "QUOTE", value: pool.quoteToken.address },
    { label: "POOL", value: pool.poolAddress },
  ];

  const socials = tokenInfo
    ? [
        { label: "Website", href: tokenInfo.website },
        { label: "Twitter", href: tokenInfo.twitter ? `https://x.com/${tokenInfo.twitter}` : null },
        { label: "Telegram", href: tokenInfo.telegram ? `https://t.me/${tokenInfo.telegram}` : null },
        { label: "Discord", href: tokenInfo.discord },
      ].filter((s): s is { label: string; href: string } => Boolean(s.href))
    : [];

  return (
    <div className="token-info-list">
      <div className="token-info-list-row">
        <span>DEX</span>
        <span>{pool.dexName ?? "Uniswap V3"}</span>
      </div>
      {rows.map(
        (row) =>
          row.value && (
            <div className="token-info-list-row" key={row.label}>
              <span>{row.label}</span>
              <code className="scan-mono">{row.value}</code>
              <button onClick={() => onCopy(row.label, row.value as string)}>
                {copiedField === row.label ? "copied" : "copy"}
              </button>
            </div>
          )
      )}

      {tokenInfo === undefined && <p style={{ marginTop: 14 }}>Loading description &amp; socials…</p>}

      {tokenInfo?.description && <p style={{ marginTop: 14 }}>{tokenInfo.description}</p>}

      {socials.length > 0 && (
        <div className="token-detail-links" style={{ marginTop: 14 }}>
          {socials.map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noreferrer">
              {s.label}
            </a>
          ))}
        </div>
      )}

      {tokenInfo === null && (
        <p style={{ marginTop: 14, color: "#5a6469" }}>
          No description or socials on record with GeckoTerminal for this token.
        </p>
      )}
    </div>
  );
}
