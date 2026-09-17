"use client";

import { useState } from "react";
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

export default function Home() {
  const [wallet, setWallet] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  async function handleScan() {
    if (!wallet.trim()) return;

    setStatus("loading");
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: wallet.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setStatus("error");
        return;
      }

      setResult(data as ScanResult);
      setStatus("done");
    } catch {
      setError("Network error — try again");
      setStatus("error");
    }
  }

  return (
    <main className="site">
      <Header />

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

function Header() {
  return (
    <header className="topbar">
      <a href="/" className="brand">
        auevo<span>_</span>
      </a>

      <nav>
        <a href="#home">Home</a>
        <a href="#bots">Bots</a>
        <a href="#insights">Insights</a>
        <a href="#docs">Docs</a>
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
              onClick={onScan}
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

      <section className="platform-teaser platform-v2">
        <div className="platform-intro">
          <div>
            <span>WHAT COMES NEXT</span>
            <h2>
              See the leak.<br />
              Then fix the execution.
            </h2>
          </div>

          <p>
            Today Auevo shows where your trading fees went. Tomorrow it becomes
            the execution layer that helps you keep more of every trade.
          </p>
        </div>

        <div className="auevo-terminal">
          <div className="terminal-ambient terminal-ambient-red" />
          <div className="terminal-ambient terminal-ambient-green" />

          <aside className="auevo-rail">
            <div className="rail-brand">
              a<span>_</span>
            </div>

            <div className="rail-nav">
              <button className="active">⌗</button>
              <button>⌁</button>
              <button>◇</button>
              <button>◎</button>
              <button>▣</button>
            </div>

            <div className="rail-bottom">
              <span>8M</span>
            </div>
          </aside>

          <div className="terminal-workspace">
            <div className="terminal-marketbar">
              <div className="market-identity">
                <span className="live-pulse" />
                <div>
                  <strong>AUEVO INTELLIGENCE</strong>
                  <small>LIVE WALLET VIEW</small>
                </div>
              </div>

              <div className="market-ticker">
                <span>
                  SOL
                  <strong>$216.42</strong>
                  <b className="up">+4.8%</b>
                </span>
                <span>
                  P&amp;L
                  <strong className="green">+$12,438</strong>
                </span>
                <span>
                  BOT FEES
                  <strong className="red">-$1,247</strong>
                </span>
                <span>
                  SAVED
                  <strong className="green">+$892</strong>
                </span>
              </div>

              <div className="market-wallet">8M9TNz...yQVg</div>
            </div>

            <div className="workspace-heading">
              <div>
                <span>WALLET PERFORMANCE / 30D</span>
                <h3>+$12,438.20</h3>
                <p><b>+24.6%</b> net performance</p>
              </div>

              <div className="workspace-actions">
                <button>30D⌄</button>
                <button className="trade-action">TRADE ↗</button>
              </div>
            </div>

            <div className="terminal-chart-stage">
              <div className="terminal-chart-grid" />

              <div className="chart-y-axis">
                <span>$15K</span>
                <span>$10K</span>
                <span>$5K</span>
                <span>$0</span>
                <span>-$5K</span>
              </div>

              <svg
                className="terminal-chart-svg"
                viewBox="0 0 900 330"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="auevoArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff344d" stopOpacity=".24" />
                    <stop offset="100%" stopColor="#ff344d" stopOpacity="0" />
                  </linearGradient>
                </defs>

                <path
                  className="terminal-area"
                  d="M0 285 L55 275 L100 253 L145 259 L190 220 L235 211 L280 180 L325 191 L370 153 L415 160 L460 124 L505 139 L550 99 L595 111 L640 76 L685 88 L730 51 L775 69 L820 40 L865 56 L900 38 L900 330 L0 330 Z"
                />

                <polyline
                  className="terminal-pnl-line"
                  points="0,285 55,275 100,253 145,259 190,220 235,211 280,180 325,191 370,153 415,160 460,124 505,139 550,99 595,111 640,76 685,88 730,51 775,69 820,40 865,56 900,38"
                />

                <polyline
                  className="terminal-fee-line"
                  points="0,288 70,289 140,292 210,294 280,298 350,299 420,304 490,307 560,310 630,313 700,317 770,319 840,322 900,324"
                />
              </svg>

              <div className="chart-crosshair">
                <i />
                <span />
              </div>

              <div className="chart-tooltip">
                <small>SEP 14 · 18:42</small>
                <strong>+$11,906</strong>
                <span>fees −$1,184</span>
              </div>

              <div className="chart-current">
                <i />
                <span>+$12,438</span>
              </div>

              <div className="chart-dates">
                <span>AUG 19</span>
                <span>AUG 25</span>
                <span>SEP 01</span>
                <span>SEP 08</span>
                <span>SEP 17</span>
              </div>
            </div>

            <div className="execution-strip">
              <div>
                <span>EXECUTION SCORE</span>
                <strong>82<span>/100</span></strong>
              </div>

              <div>
                <span>AVG BOT FEE</span>
                <strong className="red">$4.18</strong>
              </div>

              <div>
                <span>TRADES</span>
                <strong>298</strong>
              </div>

              <div>
                <span>WIN RATE</span>
                <strong className="green">68%</strong>
              </div>

              <div className="execution-insight">
                <span>AUEVO INSIGHT</span>
                <strong>You could have kept ~$892 more.</strong>
              </div>
            </div>
          </div>

          <aside className="terminal-feed">
            <div className="feed-head">
              <div>
                <span>LIVE</span>
                <strong>Opportunities</strong>
              </div>
              <i />
            </div>

            <div className="feed-list">
              <div>
                <b className="coin coin-blue">M</b>
                <span><strong>$MOOD</strong><small>5m</small></span>
                <em>+312%</em>
              </div>
              <div>
                <b className="coin coin-red">A</b>
                <span><strong>$ARC</strong><small>12m</small></span>
                <em>+124%</em>
              </div>
              <div>
                <b className="coin coin-purple">N</b>
                <span><strong>$NOVA</strong><small>18m</small></span>
                <em>+89%</em>
              </div>
              <div>
                <b className="coin coin-orange">V</b>
                <span><strong>$VIBE</strong><small>21m</small></span>
                <em>+76%</em>
              </div>
              <div>
                <b className="coin coin-yellow">T</b>
                <span><strong>$TRENCH</strong><small>37m</small></span>
                <em>+61%</em>
              </div>
            </div>

            <div className="feed-divider" />

            <div className="fee-leak">
              <span>FEE LEAK / 30D</span>
              <strong>−$1,247</strong>

              <div className="fee-leak-bar">
                <i style={{ width: "38%" }} />
                <i style={{ width: "26%" }} />
                <i style={{ width: "18%" }} />
                <i style={{ width: "9%" }} />
                <i style={{ width: "9%" }} />
              </div>

              <small>Maestro · Axiom · BullX · Trojan · Other</small>
            </div>

            <div className="future-cta">
              <span>THE NEXT AUEVO</span>
              <strong>Trade faster.<br />Keep more.</strong>
              <p>
                Execution, wallet intelligence and opportunities in one place.
              </p>
              <button>Get early access →</button>
            </div>
          </aside>

          <div className="terminal-fade" />

          <div className="terminal-development">
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
        </div>

        <div className="result-note">
          <span>◇</span>
          These are fees paid to tracked trading bots, not network gas fees.
        </div>
      </div>

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
