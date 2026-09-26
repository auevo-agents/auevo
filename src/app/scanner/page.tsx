"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Severity } from "@/lib/evm/types";
import type {
  Confidence,
  TokenScanReport,
  Verdict,
} from "@/lib/token-security";

type Status = "idle" | "loading" | "error" | "done";

const VERDICT_COPY: Record<Verdict, { label: string; line: string }> = {
  critical: {
    label: "CRITICAL RISK",
    line: "Serious problems found. Treat this token as unsafe.",
  },
  "high-risk": {
    label: "HIGH RISK",
    line: "Powers were found that let someone take your position away.",
  },
  caution: {
    label: "CAUTION",
    line: "Nothing fatal, but there is more control here than a fixed token needs.",
  },
  "low-risk": {
    label: "LOW RISK",
    line: "No dangerous powers found in the contract. That is not a guarantee.",
  },
};

const CONFIDENCE_COPY: Record<Confidence, string> = {
  high: "Every major check completed.",
  medium: "One of the checks that matters came back unknown.",
  low: "Several of the checks that matter came back unknown.",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  info: "INFO",
  good: "GOOD",
};

// Human-facing explorer, kept separate from the API base the scanner talks
// to (report.sources.blockscoutBase) — that one may be the multichain API
// host, not something meant for a person to browse.
const EXPLORER_BASE = "https://robinhoodchain.blockscout.com";

export default function ScannerPage() {
  return (
    <Suspense fallback={null}>
      <ScannerApp />
    </Suspense>
  );
}

function ScannerApp() {
  const searchParams = useSearchParams();
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<TokenScanReport | null>(null);

  async function handleScan(override?: string) {
    const target = (override ?? address).trim();
    if (!target) return;

    setStatus("loading");
    setError(null);
    setReport(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const res = await fetch("/api/token-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: target }),
        signal: controller.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setStatus("error");
        return;
      }

      setReport(data as TokenScanReport);
      setStatus("done");
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "AbortError"
          ? "The scan is taking too long — the network may be congested. Try again in a moment."
          : "Network error — try again"
      );
      setStatus("error");
    } finally {
      clearTimeout(timeout);
    }
  }

  // Same shareable-link pattern as the fee scanner:
  // auevo.io/scanner?token=0x… pre-fills and runs, so a warning posted in a
  // group chat links to the report instead of asking people to re-paste.
  useEffect(() => {
    const fromUrl = searchParams.get("token");
    if (fromUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAddress(fromUrl);
      handleScan(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <main className="site">
      <header className="topbar">
        <Link href="/" className="brand">
          auevo<span>_</span>
        </Link>

        <nav>
          <Link href="/legacy/fees">Fee scanner</Link>
          <span className="trade-nav-active">Token scanner</span>
          <Link href="/trade">Trade</Link>
        </nav>

        <div className="topbar-right">
          <span className="network-dot" />
          <span>Robinhood Chain</span>
        </div>
      </header>

      <section className="scan-layout">
        <aside className="scan-sidebar">
          <div className="pill">
            <span>FREE</span>
            <i />
            NO WALLET
            <i />
            READ-ONLY
          </div>

          <h1>
            Check the contract
            <br />
            <span>before you buy.</span>
          </h1>

          <p className="scan-lead">
            Paste a token address on Robinhood Chain. We read the deployed
            contract and tell you what its owner can still do — mint, pause,
            blacklist, or replace the code entirely.
          </p>

          <div className="wallet-box">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleScan()}
              placeholder="Token contract address (0x…)"
              spellCheck={false}
            />

            <button
              onClick={() => handleScan()}
              disabled={status === "loading" || !address.trim()}
            >
              {status === "loading" ? <span className="loader" /> : "→"}
            </button>
          </div>

          {error && <p className="error">{error}</p>}

          <p className="truth-line">
            Public chain data only. No connection, no signature.
          </p>

          {status === "done" && report && (
            <ul className="scan-sidebar-legend">
              <li>
                <i className="scan-severity-dot scan-severity-dot-critical" />
                Critical / High — act on this
              </li>
              <li>
                <i className="scan-severity-dot scan-severity-dot-medium" />
                Medium / Low — worth knowing
              </li>
              <li>
                <i className="scan-severity-dot scan-severity-dot-good" />
                Good — reduces risk
              </li>
            </ul>
          )}
        </aside>

        <div className="scan-results">
          {status === "done" && report ? (
            <Report report={report} />
          ) : (
            <div className="scan-empty">
              {status === "loading" ? (
                <>
                  <span className="loader loader-lg" />
                  <p>Reading the contract, cross-checking with GoPlus and Blockscout…</p>
                </>
              ) : (
                <>
                  <span className="scan-empty-mark">◇</span>
                  <p>Paste a contract address to see the report here.</p>
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Report({ report }: { report: TokenScanReport }) {
  const verdict = VERDICT_COPY[report.verdict];

  return (
    <div className="scan-report">
      <div className={`scan-verdict scan-verdict-${report.verdict}`}>
        <div>
          <span className="scan-verdict-label">{verdict.label}</span>
          <strong>
            {report.token.symbol ?? "Unknown token"}
            {report.token.name ? ` · ${report.token.name}` : ""}
          </strong>
          <p>{verdict.line}</p>
          <ExplorerLink address={report.address} label="View contract on explorer" />
        </div>

        <div className="scan-score">
          <div className="scan-score-number">
            <strong>{report.score}</strong>
            <span>/ 100</span>
          </div>
          {report.confidence !== "high" && (
            <small className="scan-score-caveat">low confidence</small>
          )}
        </div>
      </div>

      {report.evidenceGaps.length > 0 && (
        <div className={`scan-confidence scan-confidence-${report.confidence}`}>
          <span className="scan-confidence-label">
            CONFIDENCE: {report.confidence.toUpperCase()}
          </span>
          <p>{CONFIDENCE_COPY[report.confidence]}</p>
          <div className="scan-gap-tags">
            {report.evidenceGaps.map((gap) => (
              <span key={gap}>{gap}</span>
            ))}
          </div>
        </div>
      )}

      <div className="scan-facts">
        <Fact label="CONTRACT" value={shorten(report.address)} address={report.address} />
        <Fact
          label="SUPPLY"
          value={
            report.token.totalSupplyFormatted
              ? compactNumber(report.token.totalSupplyFormatted)
              : "unknown"
          }
        />
        <Fact
          label="OWNER"
          value={
            report.ownership
              ? report.ownership.renounced
                ? "renounced"
                : shorten(report.ownership.owner)
              : "none exposed"
          }
          address={
            report.ownership && !report.ownership.renounced
              ? report.ownership.owner
              : undefined
          }
        />
        <Fact
          label="AGE"
          value={
            report.deployment?.ageDays !== null &&
            report.deployment?.ageDays !== undefined
              ? formatAge(report.deployment.ageDays)
              : "unknown"
          }
        />
        <Fact
          label="TOP HOLDER"
          value={
            report.holders ? `${report.holders.topPercent.toFixed(1)}%` : "unknown"
          }
        />
        <Fact
          label="TYPE"
          value={report.contract.proxy ? "proxy" : "standard"}
        />
      </div>

      <div className="scan-findings">
        <div className="scan-section-heading">
          <span>WHAT WE FOUND</span>
          <strong>
            {report.findings.length}{" "}
            {report.findings.length === 1 ? "check" : "checks"} worth reading
          </strong>
        </div>

        {report.findings.map((finding) => (
          <article
            className={`scan-finding scan-finding-${finding.severity}`}
            key={finding.id}
          >
            <span className="scan-severity">
              {SEVERITY_LABEL[finding.severity]}
            </span>
            <div>
              <strong>{finding.title}</strong>
              <p>{finding.detail}</p>
              {finding.evidence && <Evidence value={finding.evidence} />}
            </div>
          </article>
        ))}
      </div>

      {report.holders && report.holders.top.length > 0 && (
        <div className="scan-holders">
          <div className="scan-section-heading">
            <span>DISTRIBUTION</span>
            <strong>
              {report.holders.partial
                ? `Top holders we could see hold ${report.holders.top10Percent.toFixed(1)}% of supply`
                : `Top holders hold ${report.holders.top10Percent.toFixed(1)}% of supply`}
            </strong>
          </div>

          <div className="scan-holder-table">
            {report.holders.top.map((holder, index) => (
              <div className="scan-holder-row" key={holder.address}>
                <span className="scan-holder-rank">{index + 1}</span>
                <a
                  href={`${EXPLORER_BASE}/address/${holder.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {shorten(holder.address)}
                </a>
                <div className="bar-cell">
                  <span>{holder.percent.toFixed(2)}%</span>
                  <i>
                    <b style={{ width: `${Math.min(100, holder.percent)}%` }} />
                  </i>
                </div>
              </div>
            ))}
          </div>

          {report.holders.partial && (
            <p className="scan-note">
              Balances are exact, read from the contract. The wallet list is
              not — gathered from{" "}
              {Number(report.holders.blocksScanned).toLocaleString("en-US")}{" "}
              blocks of Transfer history, not all of it. A large holder that
              didn&apos;t move in that window wouldn&apos;t appear here.
            </p>
          )}
        </div>
      )}

      <div className="scan-limits">
        <div className="scan-section-heading">
          <span>WHAT THIS DOESN&apos;T COVER</span>
        </div>

        <ul>
          {report.checksSkipped.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>

        <p className="scan-note">
          Best-effort read of public chain data, not an audit. A clean report
          means no dangerous powers were found in the code — not a promise
          the token is safe to buy.
        </p>

        <div className="scan-sources">
          <span>SOURCES</span>
          <Source name="Robinhood Chain RPC" status={report.sources.rpc} />
          <Source name="GoPlus" status={report.sources.goplus} />
          <Source
            name="Blockscout"
            status={report.sources.blockscout}
            note={hostOf(report.sources.blockscoutBase)}
          />
          <Source name="Quick Intel" status={report.sources.quickIntel} />
        </div>
      </div>
    </div>
  );
}

const SOURCE_NOTE: Record<string, string> = {
  unavailable: "unavailable",
  off: "not configured",
};

function Source({
  name,
  status,
  note,
}: {
  name: string;
  status: "ok" | "unavailable" | "off";
  note?: string | null;
}) {
  return (
    <span className={`scan-source scan-source-${status}`}>
      <i />
      {name}
      {(SOURCE_NOTE[status] || note) && (
        <small>{SOURCE_NOTE[status] ?? note}</small>
      )}
    </span>
  );
}

/** Just the host, so the roster shows which endpoint served the data. */
function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function Fact({
  label,
  value,
  address,
}: {
  label: string;
  value: string;
  address?: string;
}) {
  return (
    <div className="scan-fact">
      <span>{label}</span>
      {address ? (
        <a
          className="scan-mono scan-fact-link"
          href={`${EXPLORER_BASE}/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {value}
        </a>
      ) : (
        <strong>{value}</strong>
      )}
    </div>
  );
}

/** A finding's evidence is sometimes an address — link it when it is. */
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function Evidence({ value }: { value: string }) {
  if (ADDRESS_RE.test(value)) {
    return (
      <a
        className="scan-evidence scan-evidence-link"
        href={`${EXPLORER_BASE}/address/${value}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {shorten(value)} ↗
      </a>
    );
  }
  return <code className="scan-evidence">{value}</code>;
}

function ExplorerLink({ address, label }: { address: string; label: string }) {
  return (
    <a
      className="scan-explorer-link"
      href={`${EXPLORER_BASE}/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {label} ↗
    </a>
  );
}

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatAge(days: number): string {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  if (days < 60) return `${Math.floor(days)}d`;
  return `${Math.floor(days / 30)}mo`;
}

function compactNumber(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(parsed);
}
