"use client";

import { useEffect, useMemo, useState } from "react";
import { Disclaimer } from "../../disclaimer";
import { BrandIcon } from "../../brand-icon";
import { UtilizationGauge } from "../../utilization-gauge";
import { EarnPanel } from "../earn-panel";

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
 * RWA_SPEC.md Phase 8's /app/lend — two distinct lending-adjacent features,
 * not one:
 *
 * - Earn: real deposit/withdraw into Morpho's curated USDG vaults, live on
 *   this app's own chain (Robinhood Chain) — see earn-panel.tsx and
 *   lib/rwa/morpho-vaults.ts for why this can be a first-party UI (same
 *   trust model as Swap/LP: an existing audited contract does the money
 *   movement) rather than a read-only link-out.
 * - Borrow: Kamino's xStocks rates, read-only. Deposits are explicitly out
 *   of scope here — Kamino runs on Solana, a different chain with a
 *   different wallet type, so there is no way to originate that
 *   transaction from this EVM-only app. KAMINO_XSTOCKS_MARKET_PUBKEY is
 *   confirmed and documented in lib/rwa/kamino.ts's own doc comment — this
 *   page's "not configured" state below is only for a deployment where
 *   that env var genuinely hasn't been set yet, not an unresolved gap.
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
        <p className="dash-eyebrow">Live on Robinhood Chain · Morpho, and read-only Kamino xStocks</p>
        <h1 className="dash-title">Earn on your stocks.</h1>
        <p className="dash-subtitle">Deposit USDG into a curated vault right here, or supply a tokenized stock as collateral on Kamino — rates straight from each market.</p>
      </div>

      <div className="scan-section-heading">
        <span>EARN</span>
        <strong>USDG vaults — deposit and withdraw directly, no linking out.</strong>
      </div>
      <EarnPanel />

      <div className="scan-section-heading" style={{ marginTop: 32 }}>
        <span>BORROW</span>
        <strong>Kamino xStocks rates — read-only, deposits happen on Kamino itself (Solana).</strong>
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
          <div className="lend-reserve-grid">
            {reserves.map((r) => {
              const utilizationPct =
                r.totalSupplyUsd !== null && r.totalSupplyUsd > 0 && r.totalBorrowUsd !== null
                  ? (r.totalBorrowUsd / r.totalSupplyUsd) * 100
                  : null;
              return (
                <div key={r.reservePubkey} className="lend-reserve-card">
                  <div className="lend-reserve-head">
                    <BrandIcon symbol={r.liquidityToken} kind="ticker" size={30} />
                    <div className="lend-reserve-name">
                      <b>{r.liquidityToken}</b>
                      <small>Kamino xStocks market</small>
                    </div>
                    <a
                      className="lend-reserve-supply-link"
                      href="https://kamino.com/lending"
                      target="_blank"
                      rel="noreferrer"
                      title="Opens Kamino's lending markets — find this reserve there to supply or borrow"
                    >
                      supply ↗
                    </a>
                  </div>
                  <div className="lend-reserve-body">
                    <UtilizationGauge pct={utilizationPct} gradientId={`lend-gauge-${r.reservePubkey}`} />
                    <dl className="lend-reserve-stats">
                      <div>
                        <dt>Supply APY</dt>
                        <dd className="desk-change-pos">{formatPct(r.supplyApyPct)}</dd>
                      </div>
                      <div>
                        <dt>Borrow APY</dt>
                        <dd>{formatPct(r.borrowApyPct)}</dd>
                      </div>
                      <div>
                        <dt>Supplied</dt>
                        <dd>{formatUsd(r.totalSupplyUsd)}</dd>
                      </div>
                      <div>
                        <dt>Borrowed</dt>
                        <dd>{formatUsd(r.totalBorrowUsd)}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              );
            })}
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
