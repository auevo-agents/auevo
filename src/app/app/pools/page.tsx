"use client";

import { useEffect, useState } from "react";
import { Disclaimer } from "../../disclaimer";

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

  return (
    <>
      <header className="product-header">
        <div>
          <h3>Pools</h3>
          <p>Tokenized-stock ↔ USDG pools on Robinhood Chain</p>
        </div>
      </header>

      {error && <p className="error" style={{ marginTop: 4 }}>{error}</p>}
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
          <div className="desk-scroll">
            <div className="money-row money-row-nopair money-head">
              <span>PAIR</span>
              <span className="desk-col-right">FEE TIER</span>
              <span className="desk-col-right">LIQUIDITY (AT PRICE)</span>
              <span className="desk-col-right">VOLUME 24H</span>
              <span className="desk-col-right">FEE APR</span>
            </div>
            {pools.map((p) => (
              <div key={p.poolId ?? p.poolAddress} className="money-row money-row-nopair">
                <span>
                  <b>{p.ticker ?? p.symbol ?? "?"}</b> / USDG
                  <br />
                  <small style={{ color: "#5a6469" }}>{p.dex === "uniswap_v4" ? "v4" : "v3"}</small>
                </span>
                <span className="desk-col-right">{(p.feeTier / 10_000).toFixed(2)}%</span>
                <span className="desk-col-right">{formatUsd(p.liquidityUsd)}</span>
                <span className="desk-col-right">{formatUsd(p.volume24hUsd)}</span>
                <span className="desk-col-right">{formatPct(p.feeAprPct)}</span>
              </div>
            ))}
          </div>
          <p className="desk-note">
            &quot;Liquidity&quot; is the pool&apos;s virtual reserves at its current price (from its active
            liquidity), not a full-range TVL figure — Uniswap v4 has no subgraph this app reads from, and true
            full-range TVL needs traversing every initialized tick range, which this app doesn&apos;t do. Volume
            is summed directly from indexed USDG-side swap amounts over the last 24h — no external price needed
            for that half. Adding liquidity from this page is not built yet (RWA_SPEC.md Phase 8: &quot;позже&quot;).
          </p>
          <Disclaimer compact />
        </>
      )}
    </>
  );
}
