"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { chainNameFor } from "@/lib/rwa/lifi/chains";
import { Disclaimer } from "../../disclaimer";

/**
 * RWA_SPEC.md section 6's /app/scanner — Premium / Arbitrage / Risk /
 * Liquidity / New tabs on live data (see the /api/rwa/scanner/* routes
 * this reads). Smart Money is a documented "soon" tab: RWA_SPEC.md's own
 * phase breakdown (section 7) assigns the smart-money indexer generalization
 * work to Phase 6, not this one — showing a working-looking tab with no
 * real wallet-accumulation data behind it would be worse than saying so.
 *
 * Each tab fetches its own data lazily, on first view, rather than all six
 * on page load — Liquidity's tab in particular runs live on-chain quotes
 * per token and is meaningfully slower than the others.
 */

type Tab = "premium" | "arbitrage" | "risk" | "liquidity" | "new" | "smart-money";

const TABS: { id: Tab; label: string }[] = [
  { id: "premium", label: "Premium" },
  { id: "arbitrage", label: "Arbitrage" },
  { id: "risk", label: "Risk" },
  { id: "liquidity", label: "Liquidity" },
  { id: "new", label: "New" },
  { id: "smart-money", label: "Smart Money" },
];

function useTabData<T>(tab: Tab, active: Tab, url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (active !== tab || data !== null) return;
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true);
    fetch(url)
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (cancelled) return;
        if (!ok) {
          setError(json.error ?? "Could not load this tab");
          return;
        }
        setData(json);
      })
      .catch(() => {
        if (!cancelled) setError("Network error loading this tab");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return { data, error, loading };
}

function formatUsd(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatBps(bps: number): { text: string; className: string } {
  const pct = bps / 100;
  const sign = pct >= 0 ? "+" : "";
  return { text: `${sign}${pct.toFixed(2)}%`, className: pct >= 0 ? "desk-change-pos" : "desk-change-neg" };
}

function tickerLink(ticker: string, children: React.ReactNode) {
  return <Link href={`/app/assets/${encodeURIComponent(ticker)}`}>{children}</Link>;
}

interface PremiumRow {
  ticker: string;
  name: string;
  chainId: number;
  address: string;
  issuerId: string;
  symbol: string;
  priceUsd: number | null;
  premiumBps: number | null;
}

function PremiumTab({ active }: { active: Tab }) {
  const { data, error, loading } = useTabData<{ rows: PremiumRow[] }>("premium", active, "/api/rwa/scanner/premium");
  if (error) return <p className="error">{error}</p>;
  if (loading || !data) return <div className="app-empty">Loading…</div>;
  if (data.rows.length === 0) return <div className="app-empty">No priced tokens yet — the price cron hasn&apos;t run.</div>;

  return (
    <div className="desk-scroll">
      <div className="money-row money-row-nopair money-head">
        <span>ASSET</span>
        <span>ISSUER · CHAIN</span>
        <span className="desk-col-right">PRICE</span>
        <span className="desk-col-right">PREMIUM</span>
      </div>
      {data.rows.map((r) => {
        const premium = formatBps(r.premiumBps!);
        return (
          <div key={`${r.chainId}-${r.address}`} className="money-row money-row-nopair">
            <span>{tickerLink(r.ticker, <b>{r.ticker}</b>)}</span>
            <span>
              {r.issuerId} · {chainNameFor(r.chainId)}
            </span>
            <span className="desk-col-right">{formatUsd(r.priceUsd)}</span>
            <span className={`desk-col-right ${premium.className}`}>{premium.text}</span>
          </div>
        );
      })}
    </div>
  );
}

interface ArbitrageRow {
  ticker: string;
  name: string;
  high: { chainId: number; address: string; issuerId: string; symbol: string; priceUsd: number };
  low: { chainId: number; address: string; issuerId: string; symbol: string; priceUsd: number };
  spreadBps: number;
}

function ArbitrageTab({ active }: { active: Tab }) {
  const { data, error, loading } = useTabData<{ rows: ArbitrageRow[] }>("arbitrage", active, "/api/rwa/scanner/arbitrage");
  if (error) return <p className="error">{error}</p>;
  if (loading || !data) return <div className="app-empty">Loading…</div>;
  if (data.rows.length === 0) return <div className="app-empty">No cross-issuer spread found yet — most tickers only have one priced listing so far.</div>;

  return (
    <>
      <p style={{ color: "#7c8589", fontSize: 12, marginBottom: 8 }}>
        Raw price spread — does not net out a cross-chain bridge&apos;s fee or time. Open a row&apos;s Bridge link for a live, netted LI.FI quote.
      </p>
      <div className="desk-scroll">
        <div className="money-row money-row-nopair money-head">
          <span>ASSET</span>
          <span>HIGH</span>
          <span>LOW</span>
          <span className="desk-col-right">SPREAD</span>
          <span />
        </div>
        {data.rows.map((r) => (
          <div key={r.ticker} className="money-row money-row-nopair">
            <span>{tickerLink(r.ticker, <b>{r.ticker}</b>)}</span>
            <span>
              {r.high.issuerId} · {chainNameFor(r.high.chainId)} · {formatUsd(r.high.priceUsd)}
            </span>
            <span>
              {r.low.issuerId} · {chainNameFor(r.low.chainId)} · {formatUsd(r.low.priceUsd)}
            </span>
            <span className="desk-col-right desk-change-pos">+{(r.spreadBps / 100).toFixed(2)}%</span>
            <span className="desk-actions">
              <Link href={`/app/swap?mode=bridge&toChain=${r.high.chainId}&toToken=${r.high.address}`}>bridge →</Link>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

interface RiskRow {
  ticker: string;
  chainId: number;
  address: string;
  issuerId: string;
  symbol: string;
  score: number | null;
  canMint: boolean | null;
  canPause: boolean | null;
  canBlacklist: boolean | null;
  canFreeze: boolean | null;
  canForceTransfer: boolean | null;
  upgradeable: boolean | null;
  checkedAt: string | null;
}

function capabilityBadges(r: RiskRow) {
  const caps: { label: string; on: boolean | null }[] = [
    { label: "mint", on: r.canMint },
    { label: "pause", on: r.canPause },
    { label: "blacklist", on: r.canBlacklist },
    { label: "freeze", on: r.canFreeze },
    { label: "force-transfer", on: r.canForceTransfer },
    { label: "upgradeable", on: r.upgradeable },
  ].filter((c) => c.on);
  if (caps.length === 0) return <span style={{ color: "#5a6469" }}>none detected</span>;
  return <span>{caps.map((c) => c.label).join(", ")}</span>;
}

function RiskTab({ active }: { active: Tab }) {
  const { data, error, loading } = useTabData<{ rows: RiskRow[] }>("risk", active, "/api/rwa/scanner/risk");
  if (error) return <p className="error">{error}</p>;
  if (loading || !data) return <div className="app-empty">Loading…</div>;
  if (data.rows.length === 0) return <div className="app-empty">No tokens registered yet.</div>;

  return (
    <>
      <p style={{ color: "#7c8589", fontSize: 12, marginBottom: 8 }}>
        Not a scam score — how much the issuer can intervene (pause, freeze, force-transfer, mint, upgrade). Regulated stock issuers often have
        these by design, for compliance. Lower score = more issuer-side control power.
      </p>
      <div className="desk-scroll">
        <div className="money-row money-row-nopair money-head">
          <span>ASSET</span>
          <span>ISSUER · CHAIN</span>
          <span className="desk-col-right">SCORE</span>
          <span>CAPABILITIES</span>
        </div>
        {data.rows.map((r) => (
          <div key={`${r.chainId}-${r.address}`} className="money-row money-row-nopair">
            <span>{tickerLink(r.ticker, <b>{r.ticker}</b>)}</span>
            <span>
              {r.issuerId} · {chainNameFor(r.chainId)}
            </span>
            <span className={`desk-col-right ${r.score === null ? "" : r.score >= 70 ? "desk-change-pos" : r.score >= 40 ? "" : "desk-change-neg"}`}>
              {r.score ?? "not scanned yet"}
            </span>
            <span>{capabilityBadges(r)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

interface LiquidityRow {
  ticker: string;
  chainId: number;
  address: string;
  issuerId: string;
  symbol: string;
  depths: { usdIn: number; amountOut: string | null; priceImpactPct: number | null }[];
}

function LiquidityTab({ active }: { active: Tab }) {
  const { data, error, loading } = useTabData<{ rows: LiquidityRow[]; truncated: boolean }>("liquidity", active, "/api/rwa/scanner/liquidity");
  if (error) return <p className="error">{error}</p>;
  if (loading || !data) return <div className="app-empty">Quoting live depth on Robinhood Chain… this can take a few seconds.</div>;
  if (data.rows.length === 0) return <div className="app-empty">No Robinhood Chain tokens registered yet.</div>;

  return (
    <>
      <p style={{ color: "#7c8589", fontSize: 12, marginBottom: 8 }}>
        Robinhood Chain only (live Uniswap v3/v4 quotes) — the five bridge-target chains&apos; own liquidity isn&apos;t read here yet.
        {data.truncated && " Showing a limited set for page-load speed — open an asset page for its exact numbers."}
      </p>
      <div className="desk-scroll">
        <div className="money-row money-row-nopair money-head">
          <span>ASSET</span>
          <span className="desk-col-right">$1K IMPACT</span>
          <span className="desk-col-right">$10K IMPACT</span>
          <span className="desk-col-right">$100K IMPACT</span>
        </div>
        {data.rows.map((r) => (
          <div key={`${r.chainId}-${r.address}`} className="money-row money-row-nopair">
            <span>{tickerLink(r.ticker, <b>{r.ticker}</b>)}</span>
            {r.depths.map((d) => (
              <span key={d.usdIn} className={`desk-col-right ${d.priceImpactPct !== null && d.priceImpactPct > 1 ? "desk-change-neg" : ""}`}>
                {d.amountOut === null ? "no route" : d.priceImpactPct !== null ? `${d.priceImpactPct.toFixed(2)}%` : "—"}
              </span>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

interface NewRow {
  ticker: string;
  name: string;
  chainId: number;
  address: string;
  issuerId: string;
  symbol: string;
  discoveredAt: string;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return `${Math.round(ms / (1000 * 60))}m ago`;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function NewTab({ active }: { active: Tab }) {
  const { data, error, loading } = useTabData<{ rows: NewRow[] }>("new", active, "/api/rwa/scanner/new");
  if (error) return <p className="error">{error}</p>;
  if (loading || !data) return <div className="app-empty">Loading…</div>;
  if (data.rows.length === 0) return <div className="app-empty">No tokens discovered yet.</div>;

  return (
    <div className="desk-scroll">
      <div className="money-row money-row-nopair money-head">
        <span>ASSET</span>
        <span>ISSUER · CHAIN</span>
        <span className="desk-col-right">DISCOVERED</span>
      </div>
      {data.rows.map((r) => (
        <div key={`${r.chainId}-${r.address}`} className="money-row money-row-nopair">
          <span>{tickerLink(r.ticker, <b>{r.ticker}</b>)}</span>
          <span>
            {r.issuerId} · {chainNameFor(r.chainId)}
          </span>
          <span className="desk-col-right">{timeAgo(r.discoveredAt)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ScannerPage() {
  const [tab, setTab] = useState<Tab>("premium");

  return (
    <>
      <header className="product-header">
        <div>
          <h3>Scanner</h3>
          <p>Premium, arbitrage, risk, liquidity and new-listing signals across every tokenized stock Auevo tracks</p>
        </div>
      </header>

      <div className="desk-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "desk-tab active" : "desk-tab"} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "premium" && <PremiumTab active={tab} />}
      {tab === "arbitrage" && <ArbitrageTab active={tab} />}
      {tab === "risk" && <RiskTab active={tab} />}
      {tab === "liquidity" && <LiquidityTab active={tab} />}
      {tab === "new" && <NewTab active={tab} />}
      {tab === "smart-money" && (
        <div className="app-empty">
          Smart Money — wallets accumulating stock tokens, and their biggest trades. Needs Phase 6&apos;s indexer (v4 Swap-event attribution
          generalized from memecoins to tokenized stocks) before this shows anything real; see docs/RWA_SPEC.md phase 6.
        </div>
      )}

      <Disclaimer compact />
    </>
  );
}
