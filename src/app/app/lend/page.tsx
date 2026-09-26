"use client";

import { useEffect, useMemo, useState } from "react";
import { Disclaimer } from "../../disclaimer";

interface KaminoReserve {
  reservePubkey: string;
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
 * contracts of its own). Honest about the one real gap: the exact
 * xStocks market pubkey couldn't be confirmed from this environment
 * (network egress blocked api.kamino.finance) — see lib/rwa/kamino.ts's
 * own doc comment and /api/rwa/lend's KAMINO_XSTOCKS_MARKET_PUBKEY.
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
      <div className="dash-hero">
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
            <strong style={{ color: "#f2f4f3" }}>Not configured yet.</strong> Kamino Finance added tokenized-stock
            (xStocks) collateral to a real lending market in 2026, and Kamino does publish a public read API for
            market/reserve data — but this environment&apos;s network access couldn&apos;t reach{" "}
            <code>api.kamino.finance</code> to confirm that market&apos;s exact on-chain pubkey or double-check the
            API&apos;s field names, and this project doesn&apos;t guess addresses. Once someone opens{" "}
            <code>api.kamino.finance/documentation/</code> directly and confirms it, set{" "}
            <code>KAMINO_XSTOCKS_MARKET_PUBKEY</code> to bring this page live — see{" "}
            <code>src/lib/rwa/kamino.ts</code>.
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
              <div key={r.reservePubkey} className="dash-list-row" style={{ gridTemplateColumns: "1fr auto auto auto auto" }}>
                <span className="dash-list-name">
                  <b>{r.liquidityTokenMint.slice(0, 4)}…{r.liquidityTokenMint.slice(-4)}</b>
                  <small>Kamino xStocks market</small>
                </span>
                <span className="dash-list-col desk-change-pos">{formatPct(r.supplyApyPct)}</span>
                <span className="dash-list-col dash-list-col-hide-mobile">{formatPct(r.borrowApyPct)}</span>
                <span className="dash-list-col">{formatUsd(r.totalSupplyUsd)}</span>
                <span className="dash-list-col dash-list-col-hide-mobile">{formatUsd(r.totalBorrowUsd)}</span>
              </div>
            ))}
          </div>
          <p className="desk-note">
            Read-only — deposits happen on Kamino itself, not here. Rates come straight from Kamino&apos;s own
            public API and can move between page loads.
          </p>
          <Disclaimer compact />
        </>
      )}
    </>
  );
}
