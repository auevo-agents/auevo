"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Disclaimer } from "../../disclaimer";

interface BasketHolding {
  ticker: string;
  targetWeight: number;
}

interface BasketSummary {
  id: string;
  kind: "strategy" | "index" | "automated";
  name: string;
  description: string | null;
  holdings: BasketHolding[];
  oneYearReturn: number | null;
}

/**
 * RWA_SPEC.md Phase 7's basket catalog. Strategy baskets are real and
 * tradeable (see [id]/page.tsx); Index baskets are listed here too but
 * link to an honest gap notice instead of a trade form — Reserve
 * Protocol's DTFs (the only index-fund-on-chain product this app
 * researched) have no deployment on Robinhood Chain, confirmed against
 * Reserve's own GitHub (protocol/reserve-index-dtf repos) rather than
 * assumed, so there is nothing real to wire up yet. Automated
 * (rebalancing accounts) is explicitly out of scope for this phase per
 * the spec itself.
 */
export default function BasketsPage() {
  const [baskets, setBaskets] = useState<BasketSummary[] | null>(null);
  const [indexed, setIndexed] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/rwa/baskets")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        setBaskets(data.baskets ?? []);
        setIndexed(data.indexed);
      })
      .catch(() => {
        if (!cancelled) setError("Network error loading baskets");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <header className="product-header">
        <div>
          <h3>Baskets</h3>
          <p>Weighted baskets of tokenized stocks — bought or sold in one wallet signature</p>
        </div>
      </header>

      {error && <p className="error" style={{ marginTop: 4 }}>{error}</p>}
      {!baskets && !error && <div className="app-empty">Loading…</div>}
      {baskets && !indexed && <div className="app-empty">Baskets aren&apos;t connected yet.</div>}
      {baskets && indexed && baskets.length === 0 && <div className="app-empty">No baskets seeded yet.</div>}

      {baskets && indexed && baskets.length > 0 && (
        <>
          <div className="desk-scroll">
            <div className="money-row money-row-nopair money-head">
              <span>BASKET</span>
              <span className="desk-col-right">HOLDINGS</span>
              <span className="desk-col-right">KIND</span>
              <span />
            </div>
            {baskets.map((basket) => (
              <Link key={basket.id} href={`/app/baskets/${basket.id}`} className="money-row money-row-nopair money-row-link">
                <span>
                  <b>{basket.name}</b>
                  <br />
                  <small style={{ color: "#5a6469" }}>{basket.description}</small>
                </span>
                <span className="desk-col-right">{basket.holdings.map((h) => h.ticker).join(", ")}</span>
                <span className="desk-col-right">{basket.kind}</span>
                <span className="desk-actions">
                  <span>view →</span>
                </span>
              </Link>
            ))}
          </div>
          <p className="desk-note">
            Every basket here is a Strategy basket (source=auevo), equal-weighted by default — see each
            basket&apos;s page for target/equal/custom weight sliders. Index baskets (Reserve Protocol DTFs)
            aren&apos;t offered: Reserve has no deployment on Robinhood Chain as of this writing.
          </p>
          <Disclaimer compact />
        </>
      )}
    </>
  );
}
