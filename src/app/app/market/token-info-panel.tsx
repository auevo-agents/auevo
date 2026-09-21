"use client";

import Link from "next/link";
import type { TokenScanReport } from "@/lib/token-security";

/**
 * Real Token Info — not a fabricated risk tag. Shows what the scanner
 * behind /scanner actually computes: top-10 holder concentration, LP
 * burned/locked, total supply burned, and ownership. No Dev Holdings /
 * Snipers / Insiders / Bundlers here — those need deployer-labeled and
 * first-block forensics this scanner doesn't do yet, and showing them
 * as 0% would read as "checked, found none" rather than "not measured",
 * which is exactly the kind of false reassurance this whole app has
 * avoided everywhere else.
 *
 * Driven by useTokenScan, lifted to the page so the Holders tab can
 * share the same result instead of running a second scan.
 */

const VERDICT_LABEL: Record<TokenScanReport["verdict"], string> = {
  "low-risk": "LOW RISK",
  caution: "CAUTION",
  "high-risk": "HIGH RISK",
  critical: "CRITICAL",
};

function VerdictPill({ report }: { report: TokenScanReport }) {
  return (
    <span className={`verdict-pill verdict-pill-${report.verdict}`}>
      {VERDICT_LABEL[report.verdict]} · {report.score}/100
      {report.confidence !== "high" && <small> · low confidence</small>}
    </span>
  );
}

export function TokenInfoPanel({
  tokenAddress,
  status,
  report,
  onScan,
}: {
  tokenAddress: string;
  status: "idle" | "loading" | "done" | "error";
  report: TokenScanReport | null;
  onScan: () => void;
}) {
  return (
    <div className="token-side-card">
      <h4>Token Info</h4>

      {status === "idle" && (
        <>
          <p>Not scanned yet — a full scan takes a few seconds (contract, holders, liquidity).</p>
          <button className="app-link-button" onClick={onScan}>
            Run security scan →
          </button>
        </>
      )}

      {status === "loading" && (
        <p>
          <span className="loader" style={{ marginRight: 8 }} />
          Scanning contract, holders and liquidity…
        </p>
      )}

      {status === "error" && (
        <p>
          Could not complete a scan right now.{" "}
          <Link href={`/scanner?token=${tokenAddress}`}>Try the full Token Scanner →</Link>
        </p>
      )}

      {status === "done" && report && (
        <>
          <VerdictPill report={report} />

          <div className="token-info-grid">
            <div className="token-info-stat">
              <span>TOP 10 HOLDERS</span>
              <strong>
                {report.holders ? `${report.holders.top10Percent.toFixed(1)}%` : "unknown"}
              </strong>
            </div>
            <div className="token-info-stat">
              <span>LP BURNED/LOCKED</span>
              <strong>
                {report.liquidity.secured !== null
                  ? `${report.liquidity.secured.toFixed(0)}%`
                  : "unknown"}
              </strong>
            </div>
            <div className="token-info-stat">
              <span>SUPPLY BURNED</span>
              <strong>
                {report.holders ? `${report.holders.burnedPercent.toFixed(1)}%` : "unknown"}
              </strong>
            </div>
            <div className="token-info-stat">
              <span>OWNERSHIP</span>
              <strong>
                {!report.ownership
                  ? "no owner fn"
                  : report.ownership.renounced
                    ? "renounced"
                    : "active owner"}
              </strong>
            </div>
          </div>

          <Link href={`/scanner?token=${tokenAddress}`} className="app-link-button">
            Full report &amp; findings →
          </Link>
        </>
      )}
    </div>
  );
}
