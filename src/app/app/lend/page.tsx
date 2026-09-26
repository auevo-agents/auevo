"use client";

import { useEffect, useState } from "react";
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

  return (
    <>
      <header className="product-header">
        <div>
          <h3>Lend</h3>
          <p>Read-only lending rates for tokenized stocks</p>
        </div>
      </header>

      {configured === null && !error && <div className="app-empty">Loading…</div>}

      {configured === false && (
        <div className="app-empty app-empty-text">
          <p>
            <strong>Not configured yet.</strong> Kamino Finance added tokenized-stock (xStocks) collateral to a
            real lending market in 2026, and Kamino does publish a public read API for market/reserve data — but
            this environment&apos;s network access couldn&apos;t reach{" "}
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
          <div className="desk-scroll">
            <div className="money-row money-row-nopair money-head">
              <span>RESERVE</span>
              <span className="desk-col-right">SUPPLY APY</span>
              <span className="desk-col-right">BORROW APY</span>
              <span className="desk-col-right">SUPPLIED</span>
              <span className="desk-col-right">BORROWED</span>
            </div>
            {reserves.map((r) => (
              <div key={r.reservePubkey} className="money-row money-row-nopair">
                <span>
                  <small style={{ color: "#5a6469" }}>{r.liquidityTokenMint}</small>
                </span>
                <span className="desk-col-right desk-change-pos">{formatPct(r.supplyApyPct)}</span>
                <span className="desk-col-right">{formatPct(r.borrowApyPct)}</span>
                <span className="desk-col-right">{formatUsd(r.totalSupplyUsd)}</span>
                <span className="desk-col-right">{formatUsd(r.totalBorrowUsd)}</span>
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
