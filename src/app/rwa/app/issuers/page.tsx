"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface Issuer {
  id: string;
  name: string;
  suffix: string | null;
  website: string | null;
  description: string | null;
  backingNote: string | null;
  tickerCount: number;
  tokenCount: number;
}

/**
 * RWA_SPEC.md Phase 3's /app/issuers — the issuers seeded in Phase 1
 * (0003_rwa.sql), each with how many tickers/tokens the registry has
 * actually discovered for them, not just their static profile. Ordered
 * by tokenCount so the issuers this app actually has live data for sort
 * to the top instead of an arbitrary/alphabetical list.
 */
export default function IssuersPage() {
  const [issuers, setIssuers] = useState<Issuer[] | null>(null);
  const [indexed, setIndexed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/rwa/issuers");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not load issuers");
          return;
        }
        setIssuers([...data.issuers].sort((a: Issuer, b: Issuer) => b.tokenCount - a.tokenCount));
        setIndexed(data.indexed);
      } catch {
        if (!cancelled) setError("Network error loading issuers");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredIssuers = useMemo(() => {
    if (!issuers) return null;
    const needle = query.trim().toLowerCase();
    if (!needle) return issuers;
    return issuers.filter((issuer) => [issuer.name, issuer.suffix, issuer.description, issuer.backingNote].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [issuers, query]);

  return (
    <>
      <header className="product-header product-header--issuers">
        <div>
          <h3>Issuers</h3>
          <p>Who backs each tokenized asset, and by their own disclosures — not verified by us</p>
        </div>
      </header>

      {error && <p className="error" style={{ marginTop: 4 }}>{error}</p>}
      {!issuers && !error && <div className="app-empty">Loading…</div>}
      {issuers && !indexed && <div className="app-empty">The asset registry isn&apos;t connected yet.</div>}

      {issuers && indexed && (
        <>
          <section className="issuer-explorer-head">
            <div>
              <span className="issuer-explorer-kicker"><i /> All issuers</span>
              <h4>Explore <em>more issuers</em></h4>
            </div>
            <label className="issuer-search">
              <span aria-hidden="true">⌕</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search issuers, assets or chains…" />
              <kbd>/</kbd>
            </label>
          </section>
          <div className="issuer-card-grid">
          {(filteredIssuers ?? []).map((issuer, index) => {
            const isLive = issuer.tokenCount > 0;
            const monogram = issuer.name
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase();

            return (
              <article
                key={issuer.id}
                className={`issuer-card ${isLive ? "issuer-card--active" : "issuer-card--profile"}`}
              >
                <div className="issuer-card-topline">
                  <span className="issuer-card-monogram" aria-hidden="true">{monogram || index + 1}</span>
                  <span className={`issuer-card-status ${isLive ? "issuer-card-status--live" : ""}`}>
                    {isLive ? "Live registry" : "Issuer profile"}
                  </span>
                </div>
                <div className="issuer-card-copy">
                  <h4>{issuer.name}</h4>
                  {issuer.suffix && <span className="issuer-card-suffix">Token suffix · {issuer.suffix}</span>}
                  {issuer.backingNote && <p>{issuer.backingNote}</p>}
                </div>
                <div className="issuer-card-stats">
                  <div><strong>{issuer.tickerCount}</strong><span>Tickers</span></div>
                  <div><strong>{issuer.tokenCount}</strong><span>Tokens</span></div>
                </div>
                <div className="issuer-card-footer">
                  {issuer.website && (
                    <a href={issuer.website} target="_blank" rel="noreferrer">Issuer site</a>
                  )}
                  {isLive && (
                    <Link href={`/rwa/app/assets?issuer=${issuer.id}`} className="issuer-card-open">
                      View registry
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
          </div>
          {filteredIssuers?.length === 0 && <div className="app-empty">No issuers match this search.</div>}
        </>
      )}
    </>
  );
}
