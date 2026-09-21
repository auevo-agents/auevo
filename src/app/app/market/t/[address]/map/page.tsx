"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "../../../../connect-button";
import { ConstellationMap } from "../../../constellation-map";
import type { MarketPool } from "@/lib/geckoterminal";
import type { TokenScanReport } from "@/lib/token-security";

/**
 * The Constellation Map — a dedicated page (not a tab) since it's a big
 * canvas visualization, matching how nlyra.xyz treats its own /map/{address}
 * as a standalone view rather than something squeezed into a sidebar tab.
 */
export default function ConstellationMapPage(
  props: PageProps<"/app/market/t/[address]/map">
) {
  const { address } = use(props.params);

  const [pool, setPool] = useState<MarketPool | null | undefined>(undefined);
  const [report, setReport] = useState<TokenScanReport | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const poolRes = await fetch(`/api/market/pool/${address}`);
        const poolData = await poolRes.json();
        if (cancelled) return;
        if (!poolRes.ok || !poolData.pool?.baseToken.address) {
          setPool(null);
          setError(poolData.error ?? "Pool not found");
          return;
        }
        setPool(poolData.pool);

        const scanRes = await fetch("/api/token-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: poolData.pool.baseToken.address }),
        });
        const scanData = await scanRes.json();
        if (cancelled) return;
        if (!scanRes.ok) {
          setReport(null);
          setError(scanData.error ?? "Could not scan this token");
          return;
        }
        setReport(scanData);
      } catch {
        if (!cancelled) {
          setPool(null);
          setError("Network error loading this token");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const graph = report?.holders?.graph;

  return (
    <>
      <header className="product-header">
        <div>
          <h3>Constellation Map</h3>
          <p>Holder funding graph · Robinhood Chain</p>
        </div>
        <ConnectButton />
      </header>

      <Link href={`/app/market/t/${address}`} className="token-back">
        ← Back to {pool?.baseToken.symbol ?? "token"}
      </Link>

      {(pool === undefined || (pool && report === undefined)) && !error && (
        <div className="app-empty" style={{ marginTop: 20 }}>
          <span className="loader" style={{ marginRight: 8 }} />
          {pool === undefined ? "Loading pool…" : "Scanning holders and building the graph…"}
        </div>
      )}

      {error && (
        <div className="app-empty" style={{ marginTop: 20 }}>
          {error}
        </div>
      )}

      {pool && report && graph && (
        <>
          <div className="token-detail-header" style={{ marginTop: 14 }}>
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
                  {graph.nodes.length} nodes · {graph.edges.length} funding edges
                  {graph.truncated ? " (truncated to the largest)" : ""}
                </span>
              </div>
            </div>
          </div>

          {graph.nodes.length === 0 ? (
            <div className="app-empty" style={{ marginTop: 20 }}>
              No holder data available to graph for this token.
            </div>
          ) : (
            <div style={{ marginTop: 20 }}>
              <ConstellationMap nodes={graph.nodes} edges={graph.edges} />
            </div>
          )}

          <p className="desk-note">
            Built from this token&apos;s own Transfer log history — the same scan behind{" "}
            <Link href={`/scanner?token=${pool.baseToken.address}`}>Token Scanner</Link>,
            restricted to the {graph.nodes.length} largest holders
            {report.holders?.partial
              ? ". The underlying scan only covered part of this token's history, so some holders or connections may be missing."
              : "."}{" "}
            Shape and connections are facts about token flow — not a verdict on any
            wallet shown here.
          </p>
        </>
      )}
    </>
  );
}
