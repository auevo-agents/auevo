"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatUnits } from "viem";
import { useAccount, useBalance } from "wagmi";
import { robinhoodChain } from "@/lib/chains";
import { LIFI_EVM_CHAINS, chainNameFor } from "@/lib/rwa/lifi/chains";
import { LandingCards } from "../landing-cards";
import { BrandIcon } from "../brand-icon";
import { ConnectButton } from "./connect-button";

/**
 * Internal workspace overview — the first real (non-mockup) screen of the
 * platform nlyra.xyz-style buildout is heading toward. Everything on this
 * page is either read-only against the connected wallet's own account or
 * a link to a tool that already exists; nothing here custodies funds.
 *
 * Restructured to add the two things a static KPI-strip-plus-cards page
 * was missing next to the quick-action grid: a live "Scanner highlights"
 * table (the same /api/rwa/scanner/* routes the full Scanner page reads,
 * just Premium/Risk/New rather than all seven tabs — the fast ones,
 * since this loads on every workspace visit) and a "Market map" panel of
 * the same top tickers as clickable chips. Both read real data and
 * degrade to an honest empty state rather than a fabricated row if the
 * registry hasn't priced/scored anything yet.
 */

const QUICK_ACTIONS = [
  {
    num: "01",
    title: "Assets",
    body: "Every tokenized stock and ETF this app's registry has found, across every issuer and chain.",
    tag: "Browse",
    href: "/app/assets",
    mockup: "chips",
  },
  {
    num: "02",
    title: "Scanner",
    body: "Premium, arbitrage, contract risk, liquidity depth and new listings — ranked, not just listed.",
    tag: "6 tabs",
    href: "/app/scanner",
    mockup: "compare",
  },
  {
    num: "03",
    title: "Baskets",
    body: "Buy 5–10 stocks in one wallet signature through Uniswap v4.",
    tag: "One signature",
    href: "/app/baskets",
    mockup: "checklist",
  },
  {
    num: "04",
    title: "Pools",
    body: "v4 RWA/USDG pools on Robinhood Chain — liquidity, volume and fee APR.",
    tag: "Uniswap v4",
    href: "/app/pools",
    mockup: "apr",
  },
  {
    num: "05",
    title: "Swap & Bridge",
    body: "Trade on Robinhood Chain, or bridge tokenized assets in from five other chains.",
    tag: "Best route",
    href: "/app/swap",
    mockup: "compare",
  },
  {
    num: "06",
    title: "Portfolio",
    body: "Your RWA holdings in USD, cost basis and unrealized PnL.",
    tag: "Your wallet",
    href: "/app/portfolio",
    mockup: "alert",
  },
] as const;

function useRegistryStats() {
  const [assetCount, setAssetCount] = useState<number | null>(null);
  const [issuerCount, setIssuerCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/rwa/assets?sort=alphabetical")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.assets)) setAssetCount(data.assets.length);
      })
      .catch(() => {});
    fetch("/api/rwa/issuers")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.issuers)) {
          setIssuerCount(data.issuers.filter((i: { tokenCount: number }) => i.tokenCount > 0).length);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return { assetCount, issuerCount };
}

type HighlightTab = "premium" | "risk" | "new";

const HIGHLIGHT_TABS: { id: HighlightTab; label: string; url: string }[] = [
  { id: "premium", label: "Premium", url: "/api/rwa/scanner/premium" },
  { id: "risk", label: "Risk", url: "/api/rwa/scanner/risk" },
  { id: "new", label: "New listings", url: "/api/rwa/scanner/new" },
];

interface HighlightRow {
  ticker: string;
  name: string;
  chainId: number;
  issuerId: string;
  symbol: string;
  priceUsd?: number | null;
  premiumBps?: number | null;
  score?: number | null;
}

const HIGHLIGHT_LIMIT = 5;

function useHighlightTab(tab: HighlightTab, active: HighlightTab, url: string, enabled = true) {
  const [rows, setRows] = useState<HighlightRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || active !== tab || rows !== null) return;
    let cancelled = false;
    fetch(url)
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (cancelled) return;
        if (!ok) {
          setError(json.error ?? "Could not load this tab");
          return;
        }
        setRows((json.rows ?? []).slice(0, HIGHLIGHT_LIMIT));
      })
      .catch(() => {
        if (!cancelled) setError("Network error loading this tab");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return { rows, error };
}

function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatBps(bps: number): { text: string; className: string } {
  const pct = bps / 100;
  const sign = pct >= 0 ? "+" : "";
  return { text: `${sign}${pct.toFixed(2)}%`, className: pct >= 0 ? "desk-change-pos" : "desk-change-neg" };
}

function HighlightTable({
  tab,
  active,
  preloaded,
}: {
  tab: HighlightTab;
  active: HighlightTab;
  /** Premium is fetched once at the page level (Market Map needs it regardless of which tab is active) — passed down here instead of fetching it a second time. */
  preloaded?: { rows: HighlightRow[] | null; error: string | null };
}) {
  const url = HIGHLIGHT_TABS.find((t) => t.id === tab)!.url;
  const fetched = useHighlightTab(tab, active, url, !preloaded);
  const { rows, error } = preloaded ?? fetched;

  if (active !== tab) return null;
  if (error) return <p className="error">{error}</p>;
  if (!rows) return <div className="app-empty">Loading…</div>;
  if (rows.length === 0) {
    return (
      <div className="app-empty">
        {tab === "premium" && "No priced tokens yet — the price cron hasn't caught up."}
        {tab === "risk" && "No contract-risk scans yet — the risk cron hasn't caught up."}
        {tab === "new" && "No tokens discovered yet."}
      </div>
    );
  }

  return (
    <div className="dash-list-card">
      {rows.map((row) => (
        <Link key={`${row.chainId}:${row.ticker}`} href={`/app/assets/${encodeURIComponent(row.ticker)}`} className="dash-list-row">
          <BrandIcon symbol={row.ticker} name={row.name} kind="ticker" size={28} />
          <span className="dash-list-name">
            <b>{row.ticker}</b>
            <small>{chainNameFor(row.chainId)}</small>
          </span>
          {tab === "premium" && (
            <>
              <span className="dash-list-col">{formatUsd(row.priceUsd)}</span>
              <span className={`dash-list-col ${row.premiumBps !== null && row.premiumBps !== undefined ? formatBps(row.premiumBps).className : ""}`}>
                {row.premiumBps !== null && row.premiumBps !== undefined ? formatBps(row.premiumBps).text : "—"}
              </span>
            </>
          )}
          {tab === "risk" && (
            <span className={`dash-list-col ${row.score !== null && row.score !== undefined && row.score >= 70 ? "desk-change-pos" : "desk-change-neg"}`}>
              {row.score !== null && row.score !== undefined ? `risk ${row.score}` : "unscored"}
            </span>
          )}
          {tab === "new" && <span className="dash-list-col">{row.symbol}</span>}
        </Link>
      ))}
    </div>
  );
}

/** Compact "top tickers" chip row — same Premium data the highlight table's first tab already fetched, reused as clickable chips rather than a second call. */
function MarketMap({ rows }: { rows: HighlightRow[] | null }) {
  if (!rows || rows.length === 0) {
    return <div className="app-empty">No live tickers to map yet.</div>;
  }
  return (
    <div className="landing2-partners" style={{ padding: 0, justifyContent: "flex-start" }}>
      {rows.map((row) => (
        <Link key={row.ticker} href={`/app/assets/${encodeURIComponent(row.ticker)}`} className="landing2-partner-chip">
          <BrandIcon symbol={row.ticker} name={row.name} kind="ticker" size={22} />
          {row.ticker}
          {row.premiumBps !== null && row.premiumBps !== undefined && (
            <span className={formatBps(row.premiumBps).className} style={{ fontSize: 11 }}>
              {formatBps(row.premiumBps).text}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

export default function AppOverviewPage() {
  const { address, isConnected, chainId } = useAccount();
  const balance = useBalance({
    address,
    chainId: robinhoodChain.id,
    query: { enabled: Boolean(address) },
  });
  const { assetCount, issuerCount } = useRegistryStats();
  const [highlightTab, setHighlightTab] = useState<HighlightTab>("premium");
  const premiumPreview = useHighlightTab("premium", "premium", "/api/rwa/scanner/premium");

  const wrongChain = isConnected && chainId !== robinhoodChain.id;

  return (
    <>
      <header className="product-header">
        <div>
          <h3>Overview</h3>
          <p>Your tokenized markets workspace · Robinhood Chain</p>
        </div>

        <ConnectButton />
      </header>

      {wrongChain && (
        <div className="app-notice">
          Connected wallet is on a different chain. Switch to{" "}
          {robinhoodChain.name} to see balances here.
        </div>
      )}

      <div className="app-kpis">
        <article className="app-kpi">
          <span>NATIVE BALANCE</span>
          <strong>
            {!isConnected
              ? "—"
              : balance.isLoading
                ? "…"
                : balance.data
                  ? `${Number(
                      formatUnits(balance.data.value, balance.data.decimals),
                    ).toFixed(4)} ${balance.data.symbol}`
                  : "unknown"}
          </strong>
        </article>

        <article className="app-kpi">
          <span>WALLET</span>
          <strong className="scan-mono app-kpi-address">
            {address
              ? `${address.slice(0, 8)}…${address.slice(-6)}`
              : "not connected"}
          </strong>
        </article>

        <article className="app-kpi">
          <span>NETWORK</span>
          <strong>{robinhoodChain.name}</strong>
        </article>
      </div>

      <div className="dash-stat-strip" style={{ margin: "24px 0" }}>
        <div className="dash-stat">
          <div className="dash-stat-value">{assetCount ?? "—"}</div>
          <div className="dash-stat-label">ASSETS TRACKED</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-value">{issuerCount ?? "—"}</div>
          <div className="dash-stat-label">ISSUERS</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-value">{LIFI_EVM_CHAINS.length}</div>
          <div className="dash-stat-label">CHAINS SUPPORTED</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 16, alignItems: "start" }}>
        <div className="app-tools">
          <div className="scan-section-heading">
            <span>SCANNER HIGHLIGHTS</span>
            <strong>Real-time opportunities across tokenized assets, issuers and chains.</strong>
          </div>

          <div className="desk-tabs">
            {HIGHLIGHT_TABS.map((t) => (
              <button
                key={t.id}
                className={highlightTab === t.id ? "desk-tab active" : "desk-tab"}
                onClick={() => setHighlightTab(t.id)}
              >
                {t.label.toUpperCase()}
              </button>
            ))}
          </div>

          {HIGHLIGHT_TABS.map((t) => (
            <HighlightTable key={t.id} tab={t.id} active={highlightTab} preloaded={t.id === "premium" ? premiumPreview : undefined} />
          ))}

          <Link href="/app/scanner" className="app-link-button" style={{ display: "inline-block", marginTop: 12 }}>
            View all markets
          </Link>
        </div>

        <div className="app-tools">
          <div className="scan-section-heading">
            <span>MARKET MAP</span>
            <strong>Tokenized assets across chains and issuers.</strong>
          </div>
          <MarketMap rows={premiumPreview.rows} />
        </div>
      </div>

      <div className="app-tools" style={{ marginTop: 24 }}>
        <div className="scan-section-heading">
          <span>QUICK ACTIONS</span>
          <strong>Everything you need to trade, track and build with tokenized markets.</strong>
        </div>

        <LandingCards cards={QUICK_ACTIONS} />
      </div>
    </>
  );
}
