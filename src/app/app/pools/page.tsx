"use client";

import { useEffect, useMemo, useState } from "react";
import { Disclaimer } from "../../disclaimer";
import { AddLiquidityPanel } from "./add-liquidity-panel";

interface PoolRow {
  poolId: string | null;
  poolAddress: string | null;
  dex: "uniswap_v3" | "uniswap_v4";
  ticker: string | null;
  symbol: string | null;
  feeTier: number;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  feeAprPct: number | null;
  updatedAt: string;
}

function formatUsd(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(2)}%`;
}

/**
 * RWA_SPEC.md Phase 8's pool list — v4 RWA/USDG pools Phase 1's registry
 * discovers and refreshes (run-registry.ts). Liquidity is explicitly
 * labeled "at current price" rather than just "liquidity": it's the
 * virtual-reserves-at-current-price approximation lib/rwa/pools.ts
 * computes, not a full-range TVL figure (v4 has no subgraph this app
 * reads from, and full-range TVL needs tick-bitmap traversal this app
 * doesn't do — see that file's own doc comment). Fee APR follows
 * HyperDex's own formula (RWA_SPEC.md section 2): daily fees × 365 /
 * liquidity.
 */
export default function RwaPoolsPage() {
  const [pools, setPools] = useState<PoolRow[] | null>(null);
  const [indexed, setIndexed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPoolId, setExpandedPoolId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/rwa/pools")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        setPools(data.pools ?? []);
        setIndexed(data.indexed);
      })
      .catch(() => {
        if (!cancelled) setError("Network error loading pools");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    if (!pools) return null;
    return pools.reduce(
      (acc, p) => ({
        liquidity: acc.liquidity + (p.liquidityUsd ?? 0),
        volume: acc.volume + (p.volume24hUsd ?? 0),
      }),
      { liquidity: 0, volume: 0 }
    );
  }, [pools]);

  return (
    <>
      <div className="dash-hero">
        <p className="dash-eyebrow">Tokenized pools · Robinhood Chain</p>
        <h1 className="dash-title">Every pool. One chain.</h1>
        <p className="dash-subtitle">
          {pools ? (
            <>
              <b>{pools.length}</b> {pools.length === 1 ? "pool" : "pools"} where tokenized stocks trade against
              USDG. Deposits take one transaction.
            </>
          ) : (
            "Tokenized-stock ↔ USDG pools on Robinhood Chain."
          )}
        </p>
      </div>

      {pools && totals && pools.length > 0 && (
        <div className="dash-stat-strip">
          <div className="dash-stat">
            <div className="dash-stat-value">{pools.length}</div>
            <div className="dash-stat-label">POOLS</div>
          </div>
          <div className="dash-stat">
            <div className="dash-stat-value">{formatUsd(totals.liquidity)}</div>
            <div className="dash-stat-label">LIQUIDITY (AT PRICE)</div>
          </div>
          <div className="dash-stat">
            <div className="dash-stat-value">{formatUsd(totals.volume)}</div>
            <div className="dash-stat-label">24H VOLUME</div>
          </div>
        </div>
      )}

      {error && <p className="error" style={{ marginTop: 16 }}>{error}</p>}
      {!pools && !error && <div className="app-empty">Loading…</div>}
      {pools && !indexed && <div className="app-empty">The pool registry isn&apos;t connected yet.</div>}
      {pools && indexed && pools.length === 0 && (
        <div className="app-empty">
          No RWA pools discovered yet — the registry cron (RWA_SPEC.md Phase 1) hasn&apos;t found any USDG-paired
          v4 pools on this chain, or hasn&apos;t run yet.
        </div>
      )}

      {pools && indexed && pools.length > 0 && (
        <>
          <div className="dash-list-card" style={{ marginTop: 8 }}>
            {pools.map((p) => {
              const key = p.poolId ?? p.poolAddress ?? "";
              const canAddLiquidity = p.dex === "uniswap_v4" && Boolean(p.poolId);
              return (
                <div key={key} className="dash-list-row" style={{ gridTemplateColumns: "auto 1fr auto auto auto auto auto", cursor: canAddLiquidity ? "default" : undefined }}>
                  <span className="dash-list-avatar" style={{ background: "var(--panel-3)", color: "#f2f4f3", fontSize: 11 }}>
                    {p.dex === "uniswap_v4" ? "v4" : "v3"}
                  </span>
                  <span className="dash-list-name">
                    <b>{p.ticker ?? p.symbol ?? "?"} / USDG</b>
                    <small>{(p.feeTier / 10_000).toFixed(2)}% fee tier</small>
                  </span>
                  <span className="dash-list-col dash-list-col-hide-mobile">Uniswap {p.dex === "uniswap_v4" ? "v4" : "v3"}</span>
                  <span className="dash-list-col">{formatUsd(p.liquidityUsd)}</span>
                  <span className="dash-list-col dash-list-col-hide-mobile">{formatUsd(p.volume24hUsd)}</span>
                  <span className="dash-list-col">{formatPct(p.feeAprPct)}</span>
                  {canAddLiquidity ? (
                    <button
                      className="dash-list-arrow"
                      style={{ background: "none", border: "none", cursor: "pointer", font: "inherit" }}
                      onClick={() => setExpandedPoolId(expandedPoolId === p.poolId ? null : p.poolId)}
                    >
                      {expandedPoolId === p.poolId ? "Close ×" : "Add liquidity"}
                    </button>
                  ) : (
                    <span className="dash-list-col dash-list-col-hide-mobile">—</span>
                  )}
                </div>
              );
            })}
          </div>

          {expandedPoolId &&
            (() => {
              const pool = pools.find((p) => p.poolId === expandedPoolId);
              if (!pool) return null;
              return <AddLiquidityPanel poolId={expandedPoolId} ticker={pool.ticker ?? pool.symbol ?? "TOKEN"} />;
            })()}
          <p className="desk-note">
            &quot;Liquidity&quot; is the pool&apos;s virtual reserves at its current price (from its active
            liquidity), not a full-range TVL figure — Uniswap v4 has no subgraph this app reads from, and true
            full-range TVL needs traversing every initialized tick range, which this app doesn&apos;t do. Volume
            is summed directly from indexed USDG-side swap amounts over the last 24h — no external price needed
            for that half. Adding liquidity (v4 pools only, full-range) mints a real Uniswap position from your
            own wallet — Auevo never touches your funds, and you keep the position&apos;s NFT.
          </p>
          <Disclaimer compact />
        </>
      )}
    </>
  );
}
