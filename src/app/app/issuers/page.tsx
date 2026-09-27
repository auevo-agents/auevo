"use client";

import { useEffect, useState } from "react";
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

  return (
    <>
      <header className="product-header">
        <div>
          <h3>Issuers</h3>
          <p>Who backs each tokenized asset, and by their own disclosures — not verified by us</p>
        </div>
      </header>

      {error && <p className="error" style={{ marginTop: 4 }}>{error}</p>}
      {!issuers && !error && <div className="app-empty">Loading…</div>}
      {issuers && !indexed && <div className="app-empty">The asset registry isn&apos;t connected yet.</div>}

      {issuers && indexed && (
        <div className="issuer-card-grid">
          {issuers.map((issuer) => (
            <article key={issuer.id} className="issuer-card">
              <h4>
                {issuer.name}
                {issuer.suffix && <span style={{ color: "#5a6469", fontWeight: 400 }}> · suffix &quot;{issuer.suffix}&quot;</span>}
              </h4>
              {issuer.backingNote && <p>{issuer.backingNote}</p>}
              <div className="issuer-card-meta">
                <span>{issuer.tickerCount} ticker{issuer.tickerCount === 1 ? "" : "s"}</span>
                <span>{issuer.tokenCount} token{issuer.tokenCount === 1 ? "" : "s"}</span>
                {issuer.website && (
                  <a href={issuer.website} target="_blank" rel="noreferrer">
                    website
                  </a>
                )}
              </div>
              {issuer.tokenCount > 0 && (
                <Link href={`/app/assets?issuer=${issuer.id}`} className="app-link-button">
                  View {issuer.tokenCount} token{issuer.tokenCount === 1 ? "" : "s"} →
                </Link>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
