"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { ScanResult } from "@/lib/scan";

type Status = "idle" | "loading" | "error" | "done";

const EXAMPLE_FEES = [
  ["AXIOM", "$128.32"],
  ["BULLX", "$97.14"],
  ["TROJAN", "$43.21"],
  ["BONKBOT", "$12.83"],
  ["PHOTON", "$8.11"],
  ["MAESTRO", "$6.54"],
];

export default function FeesPage() {
  return (
    <Suspense fallback={null}>
      <AuevoApp />
    </Suspense>
  );
}

function AuevoApp() {
  const searchParams = useSearchParams();
  const [wallet, setWallet] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  async function handleScan(addressOverride?: string) {
    const address = (addressOverride ?? wallet).trim();
    if (!address) return;

    setStatus("loading");
    setError(null);
    setResult(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address }),
        signal: controller.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setStatus("error");
        return;
      }

      setResult(data as ScanResult);
      setStatus("done");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError(
          "This wallet has a lot of history and the scan is taking too long — try again in a moment."
        );
      } else {
        setError("Network error — try again");
      }
      setStatus("error");
    } finally {
      clearTimeout(timeout);
    }
  }

  // Shareable links: auevo.io/fees?wallet=<address> pre-fills and auto-runs
  // the scan, so a social post can link straight to a verifiable result
  // instead of asking people to paste the address themselves. Links from
  // before the scanner moved off the homepage (auevo.io/?wallet=<address>)
  // still work — "/" forwards here and carries the parameter over.
  useEffect(() => {
    const fromUrl = searchParams.get("wallet");
    if (fromUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWallet(fromUrl);
      handleScan(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function goToSection(id: string) {
    setResult(null);
    setStatus("idle");
    setError(null);
    // Landing (and its #home/#bots/#insights/#docs anchors) only exists
    // when we're not showing a result — wait two frames for it to mount
    // and paint before scrolling, since a plain #anchor jump does nothing
    // when the target isn't in the DOM yet.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document
          .getElementById(id)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  return (
    <main className="site">
      <Header onNavigate={goToSection} />

      {status === "done" && result ? (
        <ResultView
          result={result}
          onNewScan={() => {
            setResult(null);
            setStatus("idle");
            setError(null);
          }}
        />
      ) : (
        <Landing
          wallet={wallet}
          setWallet={setWallet}
          status={status}
          error={error}
          onScan={handleScan}
        />
      )}
    </main>
  );
}

function Header({ onNavigate }: { onNavigate: (id: string) => void }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        auevo<span>_</span>
      </Link>

      <nav>
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            onNavigate("home");
          }}
        >
          Fee scanner
        </a>
        <a
          href="#bots"
          onClick={(e) => {
            e.preventDefault();
            onNavigate("bots");
          }}
        >
          Bots
        </a>
        <a
          href="#insights"
          onClick={(e) => {
            e.preventDefault();
            onNavigate("insights");
          }}
        >
          Insights
        </a>
        <a
          href="#docs"
          onClick={(e) => {
            e.preventDefault();
            onNavigate("docs");
          }}
        >
          Docs
        </a>
        <a href="/scanner">
          Token scanner
        </a>
        <a href="/trade">
          Trade
        </a>
      </nav>

      <div className="topbar-right">
        <span className="network-dot" />
        <span>Solana</span>
      </div>
    </header>
  );
}

function Landing({
  wallet,
  setWallet,
  status,
  error,
  onScan,
}: {
  wallet: string;
  setWallet: (value: string) => void;
  status: Status;
  error: string | null;
  onScan: () => void;
}) {
  return (
    <>
      <section className="hero" id="home">
        <div className="hero-grid-bg" />

        <div className="hero-copy">
          <div className="pill">
            <span>FREE</span>
            <i />
            NO WALLET CONNECTION
            <i />
            READ-ONLY
          </div>

          <h1>
            Stop paying for
            <br />
            <span>their wins.</span>
          </h1>

          <p className="hero-description">
            Paste your wallet. See exactly how much you&apos;ve paid in trading
            bot fees — Axiom, BullX, Trojan, BonkBot and more. In seconds.
          </p>

          <div className="wallet-box">
            <div className="sol-mark" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>

            <input
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onScan()}
              placeholder="Paste your Solana wallet address"
              spellCheck={false}
            />

            <button
              onClick={() => onScan()}
              disabled={status === "loading" || !wallet.trim()}
            >
              {status === "loading" ? <span className="loader" /> : "→"}
            </button>
          </div>

          {error && <p className="error">{error}</p>}

          <p className="truth-line">
            No connection. No signature. Just the truth.
          </p>

          <div className="hero-proof">
            <div>
              <strong>90</strong>
              <span>days scanned</span>
            </div>
            <div>
              <strong>PUBLIC</strong>
              <span>public onchain data</span>
            </div>
            <div>
              <strong>0</strong>
              <span>signatures required</span>
            </div>
          </div>
        </div>

        <div className="receipt-scene" aria-hidden="true">
          <div className="scribble scribble-top">
            SAME TRADES,
            <br />
            LESS FOR YOU.
            <span>↘</span>
          </div>

          <div className="receipt-paper">
            <div className="receipt-noise" />

            <div className="receipt-title">
              <strong>BOT FEE RECEIPT</strong>
              <span>LAST 90 DAYS</span>
            </div>

            <div className="receipt-rule" />

            <div className="receipt-lines">
              {EXAMPLE_FEES.map(([name, value]) => (
                <div key={name}>
                  <span>{name}</span>
                  <i />
                  <strong>−{value}</strong>
                </div>
              ))}
            </div>

            <div className="receipt-rule" />

            <div className="receipt-total">
              <span>TOTAL</span>
              <strong>−$296.15</strong>
            </div>

            <div className="barcode">
              {Array.from({ length: 28 }).map((_, i) => (
                <i key={i} />
              ))}
            </div>

            <small>auevo.io</small>
          </div>

          <div className="scribble scribble-bottom">
            SAME MARKETS.
            <br />
            MORE FOR YOU.
          </div>
        </div>

        <div className="hero-bottom">
          <span>More transparency for crypto markets.</span>
          <span className="scroll-hint">
            SCROLL <b>↓</b>
          </span>
        </div>
      </section>

      <section className="preview" id="insights">
        <div className="preview-heading">
          <span>WHAT YOU&apos;LL SEE</span>
          <strong>Your fees. Broken down.</strong>
        </div>

        <div className="preview-window">
          <div className="preview-top">
            <div>
              <span>EXAMPLE REPORT</span>
              <h2>
                You paid <strong>$296.15</strong>
              </h2>
              <p>in trading bot fees over the last 90 days.</p>
            </div>

            <span className="preview-chain">
              <i />
              Solana
            </span>
          </div>

          <div className="preview-tabs">
            <button className="active">By bot</button>
            <button>By token</button>
            <button>By time</button>
            <button>Transactions</button>
          </div>

          <div className="preview-table" id="bots">
            <div className="preview-table-head">
              <span>BOT</span>
              <span>TRADES</span>
              <span>TOTAL FEES</span>
              <span>% OF TOTAL</span>
            </div>

            {EXAMPLE_FEES.map(([name, fee], index) => {
              const percentages = [43, 33, 15, 4, 3, 2];
              return (
                <div className="preview-row" key={name}>
                  <div>
                    <span className="bot-icon">{name.slice(0, 1)}</span>
                    <strong>{name}</strong>
                  </div>
                  <span>{[84, 61, 29, 12, 8, 6][index]}</span>
                  <span>{fee}</span>
                  <div className="bar-cell">
                    <span>{percentages[index]}%</span>
                    <i>
                      <b style={{ width: `${percentages[index]}%` }} />
                    </i>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="preview-foot">
            <span>Example data shown for product preview.</span>
            <strong>REAL WALLET → REAL NUMBERS</strong>
          </div>
        </div>
      </section>

      <section className="docs-section" id="docs">
        <div className="docs-heading">
          <span>HOW IT WORKS</span>
          <strong>What we scan. What we don&apos;t.</strong>
        </div>

        <div className="docs-grid">
          <article>
            <h3>What we scan</h3>
            <p>
              The last 90 days of public on-chain history for the wallet you
              paste — nothing else. No login, no wallet connection, no
              signature. It&apos;s the same data anyone could pull from a
              block explorer.
            </p>
          </article>

          <article>
            <h3>How we detect a fee</h3>
            <p>
              Most bots pay fees to a fixed wallet address, so we match
              transfers against a list of known addresses. A few bots
              (Axiom, Photon, GMGN, Trojan) generate a new fee address on
              every trade instead — for those we detect it by the bot&apos;s
              on-chain program being present in the transaction, not by a
              fixed destination.
            </p>
          </article>

          <article>
            <h3>What we don&apos;t count</h3>
            <p>
              Network gas — that goes to Solana validators, not the bot.
              Landing-speed tips (Jito, Astralane) — that&apos;s payment for
              fast block inclusion, not platform revenue. And BullX isn&apos;t
              covered yet; we haven&apos;t been able to inspect a live
              transaction from it.
            </p>
          </article>

          <article>
            <h3>Sources</h3>
            <p>
              On-chain data via Helius. Known fee addresses cross-checked
              against Dune Spellbook&apos;s open-source indexing models, plus
              addresses we&apos;ve verified by hand against real transactions
              on Solscan.
            </p>
          </article>
        </div>

        <p className="docs-caveat">
          This is a best-effort estimate, not an audit. Some bots rotate fee
          addresses faster than we can track, so totals may be a lower bound
          rather than exact.
        </p>
      </section>

      <section className="platform-teaser platform-v3">
        <div className="platform-intro platform-v3-intro">
          <div>
            <span>WHAT COMES NEXT</span>
            <h2>
              Know every trade.<br />
              Keep more of it.
            </h2>
          </div>

          <p>
            Fee intelligence is the first layer. Auevo is evolving into a
            complete trading workspace built around your wallets, execution
            and performance.
          </p>
        </div>

        <div className="auevo-product">
          <div className="product-glow product-glow-red" />
          <div className="product-glow product-glow-green" />

          <aside className="product-sidebar">
            <div className="product-logo">

              <strong>auevo</strong>
              <i />
            </div>

            <nav className="product-nav">
              <button className="active">
                <span className="nav-icon">
                  <i /><i /><i /><i />
                </span>
                <b>Overview</b>
              </button>

              <button>
                <span className="nav-icon nav-trading">
                  <i /><i /><i />
                </span>
                <b>Trading</b>
              </button>

              <button>
                <span className="nav-icon nav-copy">
                  <i /><i /><i />
                </span>
                <b>Copy</b>
              </button>

              <button>
                <span className="nav-icon nav-position">
                  <i /><i />
                </span>
                <b>Positions</b>
              </button>

              <button>
                <span className="nav-icon nav-analytics">
                  <i /><i /><i />
                </span>
                <b>Analytics</b>
              </button>

              <button>
                <span className="nav-icon nav-bots">
                  <i />
                </span>
                <b>Bots</b>
              </button>

              <button>
                <span className="nav-icon nav-wallet">
                  <i />
                </span>
                <b>Wallets</b>
              </button>

              <button>
                <span className="nav-icon nav-alerts">
                  <i />
                </span>
                <b>Alerts</b>
              </button>
            </nav>

            <div className="product-sidebar-bottom">
              <button><span>⚙</span> Settings</button>
              <button><span>◇</span> Referrals</button>
            </div>
          </aside>

          <main className="product-main">
            <header className="product-header">
              <div>
                <h3>Overview</h3>
                <p>Trade smarter. Keep more.</p>
              </div>

              <div className="product-header-actions">
                <button>Last 30 days <span>⌄</span></button>

                <button className="wallet-pill">
                  <i>A</i>
                  <span>8M9TNz...yQVg</span>
                </button>

                <button className="header-round">
                  <span />
                </button>
              </div>
            </header>

            <div className="product-kpis">
              <article>
                <div className="kpi-label">
                  <span>Total P&amp;L</span>
                  <i>30D</i>
                </div>
                <strong className="kpi-positive">+$12,438</strong>
                <small className="kpi-positive">↗ +24.6%</small>
                <div className="kpi-spark green-spark">
                  <i /><i /><i /><i /><i /><i />
                </div>
              </article>

              <article>
                <div className="kpi-label">
                  <span>Bot fees paid</span>
                  <i>30D</i>
                </div>
                <strong className="kpi-negative">−$1,247</strong>
                <small className="kpi-negative">8.3% of activity</small>
                <div className="kpi-spark red-spark">
                  <i /><i /><i /><i /><i /><i />
                </div>
              </article>

              <article>
                <div className="kpi-label">
                  <span>Fees saved <em>(est.)</em></span>
                  <i>AUEVO</i>
                </div>
                <strong className="kpi-positive">+$892</strong>
                <small>vs average execution</small>
                <div className="kpi-spark green-spark alt">
                  <i /><i /><i /><i /><i /><i />
                </div>
              </article>

              <article>
                <div className="kpi-label">
                  <span>Win rate</span>
                  <i>30D</i>
                </div>
                <strong>68%</strong>
                <small className="kpi-positive">↗ +12%</small>

                <div className="win-meter">
                  <i><b style={{ width: "68%" }} /></i>
                  <span>68 / 100</span>
                </div>
              </article>
            </div>

            <div className="product-grid">
              <section className="performance-card">
                <header className="card-heading">
                  <div>
                    <strong>Performance</strong>
                    <span>Wallet P&amp;L vs fees paid</span>
                  </div>

                  <div className="performance-controls">
                    <span><i className="dot-red" /> Your P&amp;L</span>
                    <span><i className="dot-gray" /> Fees paid</span>
                    <button>P&amp;L⌄</button>
                  </div>
                </header>

                <div className="performance-chart">
                  <div className="performance-y">
                    <span>$30K</span>
                    <span>$20K</span>
                    <span>$10K</span>
                    <span>$0</span>
                    <span>−$10K</span>
                  </div>

                  <div className="performance-grid-lines" />

                  <svg
                    viewBox="0 0 760 280"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient
                        id="v3PerformanceArea"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#ff344d"
                          stopOpacity=".19"
                        />
                        <stop
                          offset="100%"
                          stopColor="#ff344d"
                          stopOpacity="0"
                        />
                      </linearGradient>
                    </defs>

                    <path
                      className="v3-chart-area"
                      d="M0 230 L42 220 L78 205 L116 194 L152 177 L190 168 L228 146 L265 153 L302 126 L340 114 L378 98 L416 106 L454 82 L492 88 L530 65 L568 74 L606 48 L644 59 L682 39 L720 53 L760 43 L760 280 L0 280 Z"
                    />

                    <polyline
                      className="v3-pnl-line"
                      points="0,230 42,220 78,205 116,194 152,177 190,168 228,146 265,153 302,126 340,114 378,98 416,106 454,82 492,88 530,65 568,74 606,48 644,59 682,39 720,53 760,43"
                    />

                    <polyline
                      className="v3-fee-line"
                      points="0,232 55,233 110,235 165,234 220,238 275,239 330,241 385,243 440,244 495,248 550,250 605,252 660,251 715,249 760,247"
                    />
                  </svg>

                  <div className="performance-marker">
                    <i />
                    <span>+$12,438</span>
                  </div>

                  <div className="performance-dates">
                    <span>Aug 1</span>
                    <span>Aug 8</span>
                    <span>Aug 15</span>
                    <span>Aug 22</span>
                    <span>Aug 29</span>
                  </div>
                </div>
              </section>

              <section className="breakdown-card">
                <header className="card-heading">
                  <div>
                    <strong>Fee breakdown</strong>
                    <span>Where execution cost went</span>
                  </div>
                </header>

                <div className="breakdown-content">
                  <div className="v3-donut">
                    <div>
                      <strong>$1,247</strong>
                      <span>total fees</span>
                    </div>
                  </div>

                  <div className="v3-donut-legend">
                    <div><i className="fee-a" /><span>Maestro</span><b>38%</b></div>
                    <div><i className="fee-b" /><span>Axiom</span><b>26%</b></div>
                    <div><i className="fee-c" /><span>BullX</span><b>18%</b></div>
                    <div><i className="fee-d" /><span>Trojan</span><b>9%</b></div>
                    <div><i className="fee-e" /><span>Others</span><b>9%</b></div>
                  </div>
                </div>

                <div className="breakdown-insight">
                  <span>AUEVO INSIGHT</span>
                  <strong>$892 potentially recoverable</strong>
                </div>
              </section>
            </div>

            <div className="product-bottom-strip">
              <div>
                <span>EXECUTION SCORE</span>
                <strong>82<small>/100</small></strong>
              </div>

              <div>
                <span>TRADES</span>
                <strong>298</strong>
              </div>

              <div>
                <span>AVG BOT FEE</span>
                <strong className="kpi-negative">$4.18</strong>
              </div>

              <div>
                <span>WALLETS</span>
                <strong>4</strong>
              </div>

              <div className="bottom-insight">
                <i />
                <span>
                  <b>Execution intelligence</b>
                  Finding where your trades leak value.
                </span>
              </div>
            </div>
          </main>

          <aside className="product-right">
            <section className="opportunity-card">
              <header>
                <div>
                  <strong>Top opportunities</strong>
                  <span>Across your watchlist</span>
                </div>

                <small><i /> Live</small>
              </header>

              <div className="opportunity-list">
                <div>
                  <i className="opp-icon opp-blue">M</i>
                  <span><b>$MOOD</b><small>5m</small></span>
                  <strong>+312%</strong>
                </div>

                <div>
                  <i className="opp-icon opp-gray">A</i>
                  <span><b>$ARC</b><small>12m</small></span>
                  <strong>+124%</strong>
                </div>

                <div>
                  <i className="opp-icon opp-purple">N</i>
                  <span><b>$NOVA</b><small>18m</small></span>
                  <strong>+89%</strong>
                </div>

                <div>
                  <i className="opp-icon opp-orange">V</i>
                  <span><b>$VIBE</b><small>21m</small></span>
                  <strong>+76%</strong>
                </div>

                <div>
                  <i className="opp-icon opp-gold">T</i>
                  <span><b>$TRENCH</b><small>37m</small></span>
                  <strong>+61%</strong>
                </div>
              </div>

              <button className="view-market">
                View market intelligence <span>→</span>
              </button>
            </section>

            <section className="activity-card">
              <header>
                <strong>Execution activity</strong>
                <span>LIVE</span>
              </header>

              <div className="activity-line">
                <i className="activity-green" />
                <div>
                  <strong>Trade routed</strong>
                  <span>SOL → USDC · 14s ago</span>
                </div>
                <b>−0.18%</b>
              </div>

              <div className="activity-line">
                <i className="activity-red" />
                <div>
                  <strong>Fee detected</strong>
                  <span>Maestro · 2m ago</span>
                </div>
                <b>−$3.84</b>
              </div>

              <div className="activity-line">
                <i className="activity-green" />
                <div>
                  <strong>Better route found</strong>
                  <span>Execution · 4m ago</span>
                </div>
                <b>+$6.21</b>
              </div>
            </section>

            <section className="next-auevo-card next-auevo-card-big">
              <span>THE NEXT AUEVO</span>
              <h4>
                Trade faster.<br />
                Pay less.
              </h4>
              <p>
                Wallet intelligence, execution and opportunities — built into
                one trading workspace.
              </p>

              <div className="next-features">
                <span><i /> Execution routing</span>
                <span><i /> Wallet intelligence</span>
                <span><i /> Opportunity discovery</span>
              </div>

              <EarlyAccessForm />
            </section>
          </aside>

          <div className="product-preview-stamp">
            PRODUCT PREVIEW · IN DEVELOPMENT
          </div>
        </div>
      </section>
    </>
  );
}

function ResultView({
  result,
  onNewScan,
}: {
  result: ScanResult;
  onNewScan: () => void;
}) {
  const empty = result.totalTxScanned === 0;
  const noFees = !empty && result.breakdown.length === 0;

  return (
    <section className="result-page">
      <div className="result-toolbar">
        <button onClick={onNewScan}>← Back to home</button>
        <span>Last {result.daysScanned} days · Solana</span>
      </div>

      <div className="result-title-row">
        <div>
          <span className="result-label">YOUR FEE REPORT</span>
          <h1>
            You paid
            <strong>
              ${result.totalUsd.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </strong>
          </h1>
          <h2>in trading bot fees over the last {result.daysScanned} days</h2>
          <p>That&apos;s {result.totalSol.toFixed(3)} SOL.</p>

          {!empty && !noFees && (
            <Link href="/trade" className="trade-cta">
              Trade this wallet for ~0.5% instead of ~1% →
            </Link>
          )}
        </div>

        <div className="result-note">
          <span>◇</span>
          These are fees paid to tracked trading bots, not network gas fees.
        </div>
      </div>

      {result.warnings.length > 0 && (
        <div className="result-warning">
          {result.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {empty || noFees ? (
        <div className="empty-result">
          {empty
            ? "No transactions found for this wallet."
            : `No fees to currently tracked bots across ${result.totalTxScanned} transactions.`}
        </div>
      ) : (
        <div className="result-table">
          <div className="result-table-head">
            <span>BOT</span>
            <span>TRADES</span>
            <span>TOTAL FEES</span>
            <span>% OF TOTAL</span>
          </div>

          {result.breakdown.map((bot) => {
            const pct =
              result.totalUsd > 0
                ? (bot.usdPaid / result.totalUsd) * 100
                : 0;

            return (
              <div className="result-row" key={bot.botKey}>
                <div>
                  <span className="bot-icon">
                    {bot.name.slice(0, 1).toUpperCase()}
                  </span>
                  <strong>{bot.name}</strong>
                </div>

                <span>{bot.txCount}</span>
                <span>${bot.usdPaid.toFixed(2)}</span>

                <div className="bar-cell">
                  <span>{pct.toFixed(0)}%</span>
                  <i>
                    <b style={{ width: `${Math.min(100, pct)}%` }} />
                  </i>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!empty && !noFees && (
        <>
          <div className="result-meta">
            <span>
              {result.totalBotTrades} bot trades · {result.totalTxScanned}{" "}
              transactions scanned
            </span>
            <span>SOL @ ${result.solPriceUsd.toFixed(2)}</span>
          </div>

          <ShareButtons wallet={result.wallet} totalUsd={result.totalUsd} />

          <EmailCapture
            wallet={result.wallet}
            totalUsd={result.totalUsd}
          />
        </>
      )}

      <div className="future-scribble">
        SAME MARKETS.
        <br />
        MORE FOR YOU.
      </div>
    </section>
  );
}

function ShareButtons({
  wallet,
  totalUsd,
}: {
  wallet: string;
  totalUsd: number;
}) {
  const [copied, setCopied] = useState(false);

  const shareUrl = `https://auevo.io/fees?wallet=${wallet}`;
  const amount = totalUsd.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const shareText = `I paid $${amount} in trading bot fees over the last 90 days. See your own receipt:`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable — silently ignore, link is still visible
      // to the user via the other share options
    }
  }

  function openShare(url: string) {
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=600");
  }

  const canNativeShare =
    typeof navigator !== "undefined" && "share" in navigator;

  async function nativeShare() {
    try {
      await (
        navigator as Navigator & {
          share: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
        }
      ).share({ text: shareText, url: shareUrl });
    } catch {
      // user cancelled or API failed — no-op
    }
  }

  return (
    <div className="share-block">
      <span className="share-label">SHARE YOUR RECEIPT</span>

      <div className="share-buttons">
        <button
          className="share-btn share-btn-x"
          onClick={() =>
            openShare(
              `https://twitter.com/intent/tweet?text=${encodeURIComponent(
                shareText
              )}&url=${encodeURIComponent(shareUrl)}`
            )
          }
        >
          <span>𝕏</span> Post
        </button>

        <button
          className="share-btn"
          onClick={() =>
            openShare(
              `https://t.me/share/url?url=${encodeURIComponent(
                shareUrl
              )}&text=${encodeURIComponent(shareText)}`
            )
          }
        >
          <span>✈</span> Telegram
        </button>

        <button className="share-btn" onClick={copyLink}>
          <span>{copied ? "✓" : "⛓"}</span> {copied ? "Copied" : "Copy link"}
        </button>

        {canNativeShare && (
          <button className="share-btn" onClick={nativeShare}>
            <span>↑</span> Share
          </button>
        )}
      </div>
    </div>
  );
}

function EarlyAccessForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(
    "idle"
  );

  async function submit() {
    if (!email.trim()) return;
    setState("sending");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return <p className="early-access-done">✓ You&apos;re on the list.</p>;
  }

  return (
    <div className="early-access-form">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="you@example.com"
      />
      <button onClick={submit} disabled={state === "sending"}>
        {state === "sending" ? "…" : "Get early access"}
        <span>→</span>
      </button>
      {state === "error" && (
        <small>Couldn&apos;t save that — try again.</small>
      )}
    </div>
  );
}

function EmailCapture({
  wallet,
  totalUsd,
}: {
  wallet: string;
  totalUsd: number;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<
    "idle" | "sending" | "done" | "error"
  >("idle");

  async function submit() {
    if (!email.trim()) return;

    setState("sending");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          wallet,
          totalUsd,
        }),
      });

      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="notify-card success">
        <div className="mail-icon">✓</div>
        <div>
          <strong>You&apos;re on the list.</strong>
          <p>
            We&apos;ll let you know when there&apos;s a better way to trade.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="notify-card">
      <div className="mail-icon">✉</div>

      <div className="notify-copy">
        <strong>
          Want to know when there&apos;s a way to stop paying this?
        </strong>
        <p>
          We&apos;re building tools to help you trade smarter. Leave your email
          and we&apos;ll let you know.
        </p>

        <div className="notify-form">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="you@example.com"
          />
          <button onClick={submit} disabled={state === "sending"}>
            {state === "sending" ? "…" : "Notify me"}
          </button>
        </div>

        {state === "error" && (
          <small>Couldn&apos;t save that — try again.</small>
        )}
      </div>
    </div>
  );
}
