"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TokenScanReport } from "@/lib/token-security";

/**
 * Real Token Info — not a fabricated risk tag. Runs the same scanner
 * behind /scanner (POST /api/token-scan) against this pool's base token
 * and surfaces only the fields it actually computes: top-10 holder
 * concentration, LP burned/locked, total supply burned, and ownership.
 * No Dev Holdings / Snipers / Insiders / Bundlers here — those need
 * deployer-labeled and first-block forensics this scanner doesn't do
 * yet, and showing them as 0% would read as "checked, found none"
 * rather than "not measured", which is exactly the kind of false
 * reassurance this whole app has avoided everywhere else.
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

export function TokenInfoPanel({ tokenAddress }: { tokenAddress: string }) {
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [report, setReport] = useState<TokenScanReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus("loading");
    setReport(null);

    async function run() {
      try {
        const res = await fetch("/api/token-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: tokenAddress }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStatus("error");
          return;
        }
        setReport(data);
        setStatus("done");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [tokenAddress]);

  return (
    <div className="token-side-card">
      <h4>Token Info</h4>

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
