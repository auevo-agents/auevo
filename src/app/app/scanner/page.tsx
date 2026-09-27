"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { chainNameFor } from "@/lib/rwa/lifi/chains";
import { Disclaimer } from "../../disclaimer";

/**
 * RWA_SPEC.md section 6's /app/scanner — Premium / Arbitrage / Risk /
 * Liquidity / New / Smart Money tabs on live data (see the
 * /api/rwa/scanner/* routes this reads). Smart Money reads from Phase 6's
 * own indexer (indexer_swaps, generalized in lib/indexed-smart-money.ts to
 * price any recognized quote asset in USD, not just WETH) — only wallets
 * that have traded a *verified RWA token* count, not the generic
 * any-token leaderboard the memecoin-era Smart Money page already has.
 *
 * Each tab fetches its own data lazily, on first view, rather than all six
 * on page load — Liquidity's tab in particular runs live on-chain quotes
 * per token and is meaningfully slower than the others.
 */

type Tab = "premium" | "arbitrage" | "risk" | "liquidity" | "new" | "smart-money" | "alerts";

const TABS: { id: Tab; label: string }[] = [
  { id: "premium", label: "Premium" },
  { id: "arbitrage", label: "Arbitrage" },
  { id: "risk", label: "Risk" },
  { id: "liquidity", label: "Liquidity" },
  { id: "new", label: "New" },
  { id: "smart-money", label: "Smart Money" },
  { id: "alerts", label: "Alerts" },
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
              <Link href={`/app/swap?mode=bridge&toChain=${r.high.chainId}&toToken=${r.high.address}`}>bridge</Link>
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
          <Link
            key={`${r.chainId}-${r.address}`}
            href={`/app/assets/${encodeURIComponent(r.ticker)}`}
            className="money-row money-row-nopair money-row-link"
          >
            <span>
              <b>{r.ticker}</b>
            </span>
            <span>
              {r.issuerId} · {chainNameFor(r.chainId)}
            </span>
            <span className={`desk-col-right ${r.score === null ? "" : r.score >= 70 ? "desk-change-pos" : r.score >= 40 ? "" : "desk-change-neg"}`}>
              {r.score ?? "not scanned yet"}
            </span>
            <span>{capabilityBadges(r)}</span>
          </Link>
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
          <Link
            key={`${r.chainId}-${r.address}`}
            href={`/app/assets/${encodeURIComponent(r.ticker)}`}
            className="money-row money-row-nopair money-row-link"
          >
            <span>
              <b>{r.ticker}</b>
            </span>
            {r.depths.map((d) => (
              <span key={d.usdIn} className={`desk-col-right ${d.priceImpactPct !== null && d.priceImpactPct > 1 ? "desk-change-neg" : ""}`}>
                {d.amountOut === null ? "no route" : d.priceImpactPct !== null ? `${d.priceImpactPct.toFixed(2)}%` : "—"}
              </span>
            ))}
          </Link>
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
        <Link
          key={`${r.chainId}-${r.address}`}
          href={`/app/assets/${encodeURIComponent(r.ticker)}`}
          className="money-row money-row-nopair money-row-link"
        >
          <span>
            <b>{r.ticker}</b>
          </span>
          <span>
            {r.issuerId} · {chainNameFor(r.chainId)}
          </span>
          <span className="desk-col-right">{timeAgo(r.discoveredAt)}</span>
        </Link>
      ))}
    </div>
  );
}

interface SmartMoneyRow {
  wallet: string;
  realizedPnlUsd: number;
  wins: number;
  losses: number;
  netFlowUsd: number;
  tokensTraded: number;
  trades: number;
  tickers: string[];
}

function shortWallet(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function SmartMoneyTab({ active }: { active: Tab }) {
  const { data, error, loading } = useTabData<{ rows: SmartMoneyRow[] }>("smart-money", active, "/api/rwa/scanner/smart-money");
  if (error) return <p className="error">{error}</p>;
  if (loading || !data) return <div className="app-empty">Loading…</div>;
  if (data.rows.length === 0) {
    return (
      <div className="app-empty">
        No wallets found yet — the chain indexer (docs/RWA_SPEC.md phase 6) hasn&apos;t caught any RWA-token trades in its scanned window yet.
      </div>
    );
  }

  return (
    <>
      <p style={{ color: "#7c8589", fontSize: 12, marginBottom: 8 }}>
        Realized PnL from Auevo&apos;s own indexer, USD-priced from each trade&apos;s USDG or WETH leg — only wallets that have traded a verified
        tokenized stock. Only covers what the indexer has scanned so far, not full history.
      </p>
      <div className="desk-scroll">
        <div className="money-row money-row-nopair money-head">
          <span>WALLET</span>
          <span>TRADED</span>
          <span className="desk-col-right">REALIZED PNL</span>
          <span className="desk-col-right">WIN RATE</span>
          <span className="desk-col-right">TRADES</span>
        </div>
        {data.rows.map((r) => {
          const winRate = r.wins + r.losses > 0 ? (r.wins / (r.wins + r.losses)) * 100 : null;
          return (
            <Link key={r.wallet} href={`/app/wallets/${r.wallet}`} className="money-row money-row-nopair money-row-link">
              <span>{shortWallet(r.wallet)}</span>
              <span>{r.tickers.join(", ") || "—"}</span>
              <span className={`desk-col-right ${r.realizedPnlUsd >= 0 ? "desk-change-pos" : "desk-change-neg"}`}>
                {r.realizedPnlUsd >= 0 ? "+" : ""}
                {r.realizedPnlUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
              </span>
              <span className="desk-col-right">{winRate !== null ? `${winRate.toFixed(0)}%` : "—"}</span>
              <span className="desk-col-right">{r.trades}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}

interface AlertRow {
  id: number;
  type: "premium" | "listing" | "whale" | "price";
  params: { ticker?: string; thresholdBps?: number; minUsd?: number };
  channel: "web" | "telegram";
  created_at: string;
}

interface NotificationRow {
  id: number;
  alert_id: number;
  message: string;
  delivered_telegram: boolean;
  fired_at: string;
}

/**
 * RWA_SPEC.md section 6's "Алерты: подписка на премию > X, новый листинг
 * тикера, крупная сделка" — a subscribe form + list + fired-notifications
 * feed, scoped under Scanner (the spec lists alerts as part of that
 * section, not as its own top-level route). Evaluated once daily by
 * /api/cron/rwa-alerts (run-alerts.ts) — see that file's own note on why
 * "once daily" rather than real-time (Vercel Hobby plan's cron-frequency
 * ceiling, the same constraint documented throughout this app's other
 * crons).
 */
function AlertsTab() {
  const { address: account, isConnected } = useAccount();
  const [alerts, setAlerts] = useState<AlertRow[] | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<"premium" | "listing" | "whale">("premium");
  const [ticker, setTicker] = useState("");
  const [thresholdPct, setThresholdPct] = useState("5");
  const [minUsd, setMinUsd] = useState("50000");
  const [channel, setChannel] = useState<"web" | "telegram">("web");
  const [submitting, setSubmitting] = useState(false);

  const [linkCode, setLinkCode] = useState<{ code: string; botUsername: string | null } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  function reload() {
    if (!account) return;
    fetch(`/api/rwa/alerts?account=${account}`)
      .then((r) => r.json())
      .then((d) => setAlerts(d.alerts ?? []))
      .catch(() => setError("Network error loading alerts"));
    fetch(`/api/rwa/alerts/notifications?account=${account}`)
      .then((r) => r.json())
      .then((d) => setNotifications(d.notifications ?? []))
      .catch(() => {});
  }

  useEffect(() => {
    if (isConnected) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, isConnected]);

  async function handleCreate() {
    if (!account) return;
    setSubmitting(true);
    setError(null);
    const params =
      type === "premium"
        ? { ticker: ticker.toUpperCase(), thresholdBps: Math.round(Number(thresholdPct) * 100) }
        : type === "whale"
          ? { ticker: ticker.toUpperCase(), minUsd: Number(minUsd) }
          : ticker
            ? { ticker: ticker.toUpperCase() }
            : {};
    try {
      const res = await fetch("/api/rwa/alerts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account, type, params, channel }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create alert");
        return;
      }
      setTicker("");
      reload();
    } catch {
      setError("Network error creating alert");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!account) return;
    await fetch(`/api/rwa/alerts/${id}?account=${account}`, { method: "DELETE" });
    reload();
  }

  async function handleLinkTelegram() {
    if (!account) return;
    setLinkError(null);
    try {
      const res = await fetch("/api/rwa/alerts/telegram-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLinkError(data.error ?? "Could not generate a Telegram link code");
        return;
      }
      setLinkCode({ code: data.code, botUsername: data.botUsername });
    } catch {
      setLinkError("Network error generating a Telegram link code");
    }
  }

  if (!isConnected) return <div className="app-empty">Connect a wallet above to manage alerts.</div>;

  return (
    <div className="trade-panel trade-panel-wide">
    <div className="trade-form">
      <h4>New alert</h4>
      <div className="desk-tabs">
        <button className={type === "premium" ? "desk-tab active" : "desk-tab"} onClick={() => setType("premium")}>
          PREMIUM
        </button>
        <button className={type === "listing" ? "desk-tab active" : "desk-tab"} onClick={() => setType("listing")}>
          NEW LISTING
        </button>
        <button className={type === "whale" ? "desk-tab active" : "desk-tab"} onClick={() => setType("whale")}>
          WHALE TRADE
        </button>
      </div>

      {type !== "listing" && (
        <label>
          Ticker
          <input type="text" value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="NVDA" />
        </label>
      )}
      {type === "listing" && (
        <label>
          Ticker (optional — leave blank for any new listing)
          <input type="text" value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="NVDA" />
        </label>
      )}
      {type === "premium" && (
        <label>
          Premium threshold (%)
          <input type="number" min={0} step={0.1} value={thresholdPct} onChange={(e) => setThresholdPct(e.target.value)} />
        </label>
      )}
      {type === "whale" && (
        <label>
          Minimum trade size (USD)
          <input type="number" min={0} step={1000} value={minUsd} onChange={(e) => setMinUsd(e.target.value)} />
        </label>
      )}

      <label>
        Deliver via
        <select value={channel} onChange={(e) => setChannel(e.target.value as "web" | "telegram")}>
          <option value="web">Web only</option>
          <option value="telegram">Web + Telegram</option>
        </select>
      </label>

      {channel === "telegram" && (
        <div className="desk-note">
          <p>Link a Telegram chat once, then any alert you create with Telegram delivery will message it.</p>
          <button onClick={handleLinkTelegram}>Link Telegram</button>
          {linkError && <p className="error">{linkError}</p>}
          {linkCode && (
            <p>
              Send <code>/start {linkCode.code}</code> to{" "}
              {linkCode.botUsername ? <>@{linkCode.botUsername}</> : "the Auevo bot"} within 15 minutes.
            </p>
          )}
        </div>
      )}

      <button onClick={handleCreate} disabled={submitting || (type !== "listing" && !ticker)}>
        {submitting ? "Creating…" : "Create alert"}
      </button>
      {error && <p className="error">{error}</p>}

      <h4>Your alerts</h4>
      {!alerts && <div className="app-empty">Loading…</div>}
      {alerts && alerts.length === 0 && <div className="app-empty">No alerts yet.</div>}
      {alerts && alerts.length > 0 && (
        <div className="desk-scroll">
          {alerts.map((a) => (
            <div key={a.id} className="money-row money-row-nopair">
              <span>
                <b>{a.type}</b>
                {a.params.ticker ? ` · ${a.params.ticker}` : ""}
                {a.type === "premium" && a.params.thresholdBps ? ` > +${(a.params.thresholdBps / 100).toFixed(1)}%` : ""}
                {a.type === "whale" && a.params.minUsd ? ` ≥ $${a.params.minUsd.toLocaleString("en-US")}` : ""}
              </span>
              <span className="desk-col-right">{a.channel}</span>
              <span className="desk-actions">
                <button onClick={() => handleDelete(a.id)}>remove</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <h4>Notifications</h4>
      {!notifications && <div className="app-empty">Loading…</div>}
      {notifications && notifications.length === 0 && <div className="app-empty">Nothing fired yet.</div>}
      {notifications && notifications.length > 0 && (
        <div className="desk-scroll">
          {notifications.map((n) => (
            <div key={n.id} className="money-row money-row-nopair">
              <span>{n.message}</span>
              <span className="desk-col-right">{new Date(n.fired_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
      <p className="desk-note">
        Checked once a day (Vercel&apos;s Hobby plan won&apos;t run a cron more often) — not real-time.
      </p>
    </div>
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
      {tab === "smart-money" && <SmartMoneyTab active={tab} />}
      {tab === "alerts" && <AlertsTab />}

      <Disclaimer compact />
    </>
  );
}
