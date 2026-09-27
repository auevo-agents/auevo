"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { AssetSummary, AssetSort } from "@/lib/rwa/catalog";
import { Disclaimer } from "../../disclaimer";
import { BrandIcon } from "../../brand-icon";

/**
 * RWA_SPEC.md Phase 3's /app/assets catalog — every tokenized stock/ETF
 * this app's registry (Phase 1) has found, across every issuer and chain
 * it discovered, with the premium to the real asset where a reference
 * price is configured. See lib/rwa/catalog.ts's own doc comment for why
 * this only offers "Most Available" and alphabetical sorting rather than
 * HyperDex's volume/market-cap-based ones — those need data (liquidity,
 * volume, market cap) Phase 1's price cron deliberately doesn't populate
 * yet, so this stays one ranked list rather than fabricating three.
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

interface IssuerSummary {
  id: string;
  name: string;
  tokenCount: number;
}

type CategoryFilter = "all" | "stock" | "etf" | "commodity" | "treasury" | "private_credit";

const CATEGORY_TABS: { id: CategoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "stock", label: "Stocks" },
  { id: "etf", label: "ETFs" },
  { id: "commodity", label: "Commodities" },
  { id: "treasury", label: "Treasuries" },
  { id: "private_credit", label: "Private Credit" },
];

export default function AssetsPage() {
  return (
    <Suspense fallback={null}>
      <AssetsApp />
    </Suspense>
  );
}

function AssetsApp() {
  const searchParams = useSearchParams();
  // Read once, not re-synced on every param change — same reasoning as the
  // Swap & Bridge page's own prefill: this is the page's starting filter,
  // not a value that should keep overriding the issuer chips' own clicks.
  const [issuerFilter, setIssuerFilter] = useState<string | null>(() => searchParams.get("issuer"));
  const [sort, setSort] = useState<AssetSort>("most_available");
  const [assets, setAssets] = useState<AssetSummary[] | null>(null);
  const [issuers, setIssuers] = useState<IssuerSummary[] | null>(null);
  const [indexed, setIndexed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");

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

  useEffect(() => {
    let cancelled = false;
    fetch("/api/rwa/issuers")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.issuers)) setIssuers(data.issuers);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const activeIssuers = useMemo(() => (issuers ?? []).filter((i) => i.tokenCount > 0), [issuers]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of assets ?? []) counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
    return counts;
  }, [assets]);

  const issuerFilterName = useMemo(
    () => (issuerFilter ? issuers?.find((i) => i.id === issuerFilter)?.name ?? issuerFilter : null),
    [issuerFilter, issuers]
  );

  const filtered = useMemo(() => {
    if (!assets) return null;
    const byIssuer = issuerFilter ? assets.filter((a) => a.tokens.some((t) => t.issuerId === issuerFilter)) : assets;
    const byCategory = category === "all" ? byIssuer : byIssuer.filter((a) => a.category === category);
    const q = query.trim().toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter((a) => a.ticker.toLowerCase().includes(q) || a.name.toLowerCase().includes(q));
  }, [assets, issuerFilter, category, query]);

  return (
    <>
      <div className="dash-hero">
        <p className="dash-eyebrow">Live registry · Robinhood Chain</p>
        <h1 className="dash-title">Assets</h1>
        <p className="dash-subtitle">
          {assets ? (
            <>
              <b>{assets.length}</b> {assets.length === 1 ? "asset" : "assets"} from{" "}
              <b>{activeIssuers.length}</b> {activeIssuers.length === 1 ? "issuer" : "issuers"}. Stocks and ETFs,
              across every issuer and chain the registry has found.
            </>
          ) : (
            "Stocks and ETFs, across every issuer and chain the registry has found."
          )}
        </p>

        {activeIssuers.length > 0 && (
          <div className="landing2-partners" style={{ paddingTop: 20 }}>
            {activeIssuers.map((issuer) => (
              <button
                key={issuer.id}
                type="button"
                className="landing2-partner-chip"
                style={{
                  cursor: "pointer",
                  border: issuer.id === issuerFilter ? "1px solid rgba(201,178,124,.6)" : undefined,
                }}
                onClick={() => setIssuerFilter((current) => (current === issuer.id ? null : issuer.id))}
              >
                <BrandIcon symbol={issuer.id} name={issuer.name} kind="issuer" size={22} />
                {issuer.name}
              </button>
            ))}
          </div>
        )}

        {issuerFilter && (
          <p className="desk-note" style={{ marginTop: 12 }}>
            Filtering by issuer: <b>{issuerFilterName}</b> ·{" "}
            <button onClick={() => setIssuerFilter(null)} style={{ textDecoration: "underline" }}>
              clear
            </button>
          </p>
        )}

        <div className="dash-search">
          <span className="dash-search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search ticker or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="desk-tabs" style={{ justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
        {CATEGORY_TABS.map((tab) => {
          const count = tab.id === "all" ? assets?.length ?? 0 : categoryCounts.get(tab.id) ?? 0;
          if (tab.id !== "all" && assets && count === 0) return null;
          return (
            <button
              key={tab.id}
              className={category === tab.id ? "desk-tab active" : "desk-tab"}
              onClick={() => setCategory(tab.id)}
            >
              {tab.label.toUpperCase()}
              {assets ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      <div className="desk-tabs" style={{ justifyContent: "center", marginTop: 8 }}>
        <button className={sort === "most_available" ? "desk-tab active" : "desk-tab"} onClick={() => setSort("most_available")}>
          MOST AVAILABLE
        </button>
        <button className={sort === "alphabetical" ? "desk-tab active" : "desk-tab"} onClick={() => setSort("alphabetical")}>
          A–Z
        </button>
      </div>

      {error && <p className="error" style={{ marginTop: 16 }}>{error}</p>}

      {!assets && !error && <div className="app-empty">Loading…</div>}

      {assets && !indexed && <div className="app-empty">The asset registry isn&apos;t connected yet.</div>}

      {assets && indexed && assets.length === 0 && (
        <div className="app-empty">No underlyings seeded yet — see supabase/migrations/0004_rwa_seed_underlyings.sql.</div>
      )}

      {filtered && indexed && assets && assets.length > 0 && (
        <>
          {filtered.length === 0 ? (
            <div className="app-empty">
              {query.trim() ? `No asset matches "${query}".` : "No assets in this category yet."}
            </div>
          ) : (
            <div className="dash-list-card" style={{ marginTop: 20 }}>
              {filtered.map((asset, i) => {
                const premium = formatPremium(asset.primaryPremiumBps);
                const risk = asset.primaryRiskScore;
                return (
                  <Link key={asset.ticker} href={`/app/assets/${asset.ticker}`} className="dash-list-row">
                    <span className="dash-list-rank">{i + 1}</span>
                    <BrandIcon symbol={asset.ticker} name={asset.name} kind="ticker" size={32} />
                    <span className="dash-list-name">
                      <b>{asset.ticker}</b>
                      <small>{asset.name}</small>
                    </span>
                    <span className="dash-list-col dash-list-col-hide-mobile">
                      {asset.issuerCount || "—"} iss · {asset.chainCount || "—"} chn
                    </span>
                    <span className="dash-list-col">{formatUsd(asset.primaryPriceUsd)}</span>
                    <span className={`dash-list-col ${premium.className}`}>
                      {premium.text}
                      {risk !== null && <span className="dash-list-arrow"> · risk {risk}</span>}
                    </span>
                    <span className="dash-list-chevron" aria-hidden="true">›</span>
                  </Link>
                );
              })}
            </div>
          )}
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
