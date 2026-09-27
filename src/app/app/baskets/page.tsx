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
 * assumed, so there is nothing real to wire up yet. Every basket here also
 * has a non-custodial "Check rebalance" tool on its own page (see
 * resolveBasketRebalance in lib/rwa/baskets.ts) — HyperDex's "Automated
 * Baskets" without a custodial automated-vault contract, which
 * RWA_SPEC.md section 9 rules out.
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
      <div className="dash-hero">
        <p className="dash-eyebrow">Strategy baskets · One signature</p>
        <h1 className="dash-title">Invest in a theme.</h1>
        <p className="dash-subtitle">
          {baskets ? (
            <>
              <b>{baskets.length}</b> {baskets.length === 1 ? "basket" : "baskets"} of tokenized stocks, bought or
              sold in one wallet signature through Uniswap v4.
            </>
          ) : (
            "Weighted baskets of tokenized stocks — bought or sold in one wallet signature."
          )}
        </p>
      </div>

      {error && <p className="error" style={{ marginTop: 16 }}>{error}</p>}
      {!baskets && !error && <div className="app-empty">Loading…</div>}
      {baskets && !indexed && <div className="app-empty">Baskets aren&apos;t connected yet.</div>}
      {baskets && indexed && baskets.length === 0 && <div className="app-empty">No baskets seeded yet.</div>}

      {baskets && indexed && baskets.length > 0 && (
        <>
          <div className="dash-basket-grid" style={{ marginTop: 8 }}>
            {baskets.map((basket) => (
              <Link key={basket.id} href={`/app/baskets/${basket.id}`} className="dash-basket-card">
                <div className="dash-basket-card-head">
                  <div>
                    <h4>{basket.name}</h4>
                    <p>{basket.description}</p>
                  </div>
                  <span className="dash-basket-kind">{basket.kind}</span>
                </div>
                <div className="landing2-mockup-chips">
                  {basket.holdings.map((h) => (
                    <span className="landing2-mockup-chip" key={h.ticker}>
                      <span className="landing2-mockup-chip-dot" />
                      {h.ticker}
                    </span>
                  ))}
                </div>
                <div className="dash-basket-foot">
                  <span>{basket.holdings.length} holdings</span>
                  <span>View →</span>
                </div>
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
