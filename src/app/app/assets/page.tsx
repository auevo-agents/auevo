"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AssetSummary, AssetSort } from "@/lib/rwa/catalog";
import { Disclaimer } from "../../disclaimer";

/**
 * RWA_SPEC.md Phase 3's /app/assets catalog — every tokenized stock/ETF
 * this app's registry (Phase 1) has found, across every issuer and chain
 * it discovered, with the premium to the real asset where a reference
 * price is configured. See lib/rwa/catalog.ts's own doc comment for why
 * this only offers "Most Available" and alphabetical sorting rather than
 * HyperDex's volume/market-cap-based ones — those need data (liquidity,
 * volume, market cap) Phase 1's price cron deliberately doesn't populate
 * yet.
 */

function formatUsd(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPremium(bps: number | null): { text: string; className: string } {
  if (bps === null) return { text: "—", className: "" };
  const pct = bps / 100;
  const sign = pct >= 0 ? "+" : "";
  return { text: `${sign}${pct.toFixed(2)}%`, className: pct >= 0 ? "desk-change-pos" : "desk-change-neg" };
}

export default function AssetsPage() {
  const [sort, setSort] = useState<AssetSort>("most_available");
  const [assets, setAssets] = useState<AssetSummary[] | null>(null);
  const [indexed, setIndexed] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/rwa/assets?sort=${sort}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not load the asset catalog");
          return;
        }
        setAssets(data.assets);
        setIndexed(data.indexed);
        setError(null);
      } catch {
        if (!cancelled) setError("Network error loading the asset catalog");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [sort]);

  return (
    <>
      <header className="product-header">
        <div>
          <h3>Assets</h3>
          <p>Tokenized stocks and ETFs, across every issuer and chain the registry has found</p>
        </div>
      </header>

      <div className="desk-tabs">
        <button className={sort === "most_available" ? "desk-tab active" : "desk-tab"} onClick={() => setSort("most_available")}>
          MOST AVAILABLE
        </button>
        <button className={sort === "alphabetical" ? "desk-tab active" : "desk-tab"} onClick={() => setSort("alphabetical")}>
          A–Z
        </button>
      </div>

      {error && <p className="error" style={{ marginTop: 4 }}>{error}</p>}

      {!assets && !error && <div className="app-empty">Loading…</div>}

      {assets && !indexed && <div className="app-empty">The asset registry isn&apos;t connected yet.</div>}

      {assets && indexed && assets.length === 0 && (
        <div className="app-empty">No underlyings seeded yet — see supabase/migrations/0004_rwa_seed_underlyings.sql.</div>
      )}

      {assets && indexed && assets.length > 0 && (
        <>
          <div className="desk-scroll">
            <div className="money-row money-row-nopair money-head">
              <span>TICKER</span>
              <span className="desk-col-right">ISSUERS</span>
              <span className="desk-col-right">CHAINS</span>
              <span className="desk-col-right">PRICE</span>
              <span className="desk-col-right">PREMIUM</span>
              <span className="desk-col-right">RISK</span>
              <span />
            </div>
            {assets.map((asset) => {
              const premium = formatPremium(asset.primaryPremiumBps);
              const risk = asset.primaryRiskScore;
              return (
                <Link
                  key={asset.ticker}
                  href={`/app/assets/${asset.ticker}`}
                  className="money-row money-row-nopair money-row-link"
                >
                  <span>
                    <b>{asset.ticker}</b>
                    <br />
                    <small style={{ color: "#5a6469" }}>{asset.name}</small>
                  </span>
                  <span className="desk-col-right">{asset.issuerCount || "—"}</span>
                  <span className="desk-col-right">{asset.chainCount || "—"}</span>
                  <span className="desk-col-right">{formatUsd(asset.primaryPriceUsd)}</span>
                  <span className={`desk-col-right ${premium.className}`}>{premium.text}</span>
                  <span className={`desk-col-right ${risk === null ? "" : risk >= 70 ? "desk-change-pos" : risk >= 40 ? "" : "desk-change-neg"}`}>
                    {risk ?? "—"}
                  </span>
                  <span className="desk-actions">
                    <span>view →</span>
                  </span>
                </Link>
              );
            })}
          </div>
          <p className="desk-note">
            Price and premium come from the token trading on Robinhood Chain when one exists, otherwise the
            first issuer/chain combination with a price. Premium is only shown for tickers with a reference
            price configured (see docs/RWA_SPEC.md phase 1) — a blank premium means unknown, not zero.
          </p>
          <Disclaimer compact />
        </>
      )}
    </>
  );
}
