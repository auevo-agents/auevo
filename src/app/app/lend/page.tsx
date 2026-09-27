"use client";

import { useEffect, useMemo, useState } from "react";
import { Disclaimer } from "../../disclaimer";

interface KaminoReserve {
  reservePubkey: string;
  liquidityToken: string;
  liquidityTokenMint: string;
  supplyApyPct: number | null;
  borrowApyPct: number | null;
  totalSupplyUsd: number | null;
  totalBorrowUsd: number | null;
}

function formatUsd(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatPct(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

/**
 * RWA_SPEC.md Phase 8's /app/lend — read-only Kamino xStocks rates.
 * Deposits are explicitly out of scope (this app runs no lending
 * contracts of its own). KAMINO_XSTOCKS_MARKET_PUBKEY is confirmed and
 * documented in lib/rwa/kamino.ts's own doc comment — this page's "not
 * configured" state below is only for a deployment where that env var
 * genuinely hasn't been set yet, not an unresolved gap in this codebase.
 */
export default function LendPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [reserves, setReserves] = useState<KaminoReserve[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/rwa/lend")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setConfigured(data.configured);
        setReserves(data.reserves ?? []);
        if (data.error) setError(data.error);
      })
      .catch(() => {
        if (!cancelled) setError("Network error loading lending rates");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(
    () =>
      reserves.reduce(
        (acc, r) => ({
          supplied: acc.supplied + (r.totalSupplyUsd ?? 0),
          borrowed: acc.borrowed + (r.totalBorrowUsd ?? 0),
        }),
        { supplied: 0, borrowed: 0 }
      ),
    [reserves]
  );

  return (
    <>
      <div className="dash-hero dash-hero--lend">
        <p className="dash-eyebrow">Read-only · Kamino xStocks</p>
        <h1 className="dash-title">Earn on your stocks.</h1>
        <p className="dash-subtitle">Supply a tokenized stock as collateral, or borrow against it — rates straight from Kamino&apos;s own market.</p>
      </div>

      {configured === true && !error && reserves.length > 0 && (
        <div className="dash-stat-strip">
          <div className="dash-stat">
            <div className="dash-stat-value">{reserves.length}</div>
            <div className="dash-stat-label">RESERVES</div>
          </div>
          <div className="dash-stat">
            <div className="dash-stat-value">{formatUsd(totals.supplied)}</div>
            <div className="dash-stat-label">TOTAL SUPPLIED</div>
          </div>
          <div className="dash-stat">
            <div className="dash-stat-value">{formatUsd(totals.borrowed)}</div>
            <div className="dash-stat-label">TOTAL BORROWED</div>
          </div>
        </div>
      )}

      {configured === null && !error && <div className="app-empty">Loading…</div>}

      {configured === false && (
        <div className="dash-list-card" style={{ padding: 24 }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "var(--muted)" }}>
            <strong style={{ color: "#f2f4f3" }}>Not configured on this deployment.</strong> Kamino&apos;s xStocks
            lending market and its public read API are confirmed and working (see{" "}
            <code>src/lib/rwa/kamino.ts</code>) — this instance just doesn&apos;t have{" "}
            <code>KAMINO_XSTOCKS_MARKET_PUBKEY</code> set yet. Set it to{" "}
            <code>5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua</code> to bring this page live.
          </p>
        </div>
      )}

      {configured === true && error && (
        <div className="app-empty app-empty-text">
          <p>{error}</p>
        </div>
      )}

      {configured === true && !error && reserves.length === 0 && (
        <div className="app-empty">This market currently has no reserves to show.</div>
      )}

      {configured === true && !error && reserves.length > 0 && (
        <>
          <div className="dash-list-card" style={{ marginTop: 8 }}>
            {reserves.map((r) => (
              <div key={r.reservePubkey} className="dash-list-row" style={{ gridTemplateColumns: "1fr auto auto auto auto auto" }}>
                <span className="dash-list-name">
                  <b>{r.liquidityToken}</b>
                  <small>Kamino xStocks market</small>
                </span>
                <span className="dash-list-col desk-change-pos">{formatPct(r.supplyApyPct)}</span>
                <span className="dash-list-col dash-list-col-hide-mobile">{formatPct(r.borrowApyPct)}</span>
                <span className="dash-list-col">{formatUsd(r.totalSupplyUsd)}</span>
                <span className="dash-list-col dash-list-col-hide-mobile">{formatUsd(r.totalBorrowUsd)}</span>
                <span className="desk-actions">
                  <a
                    href="https://kamino.com/lending"
                    target="_blank"
                    rel="noreferrer"
                    title="Opens Kamino's lending markets — find this reserve there to supply or borrow"
                  >
                    supply ↗
                  </a>
                </span>
              </div>
            ))}
          </div>
          <p className="desk-note">
            Read-only — deposits happen on Kamino itself, not here. Rates come straight from Kamino&apos;s own
            public API and can move between page loads.
          </p>
          <p className="desk-note">
            Want leverage on a tokenized-stock position (deposit → borrow → re-deposit in one loop)? That&apos;s
            Kamino&apos;s own <a href="https://app.kamino.finance/multiply" target="_blank" rel="noreferrer">Multiply</a> product
            built on this same market — Auevo doesn&apos;t run a leveraged-loop contract of its own, so this links out
            rather than reimplementing it.
          </p>
          <Disclaimer compact />
        </>
      )}
    </>
  );
}
