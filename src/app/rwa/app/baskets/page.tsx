"use client";

import { type CSSProperties, useEffect, useState } from "react";
import Link from "next/link";
import { Disclaimer } from "@/app/disclaimer";
import { BrandIcon } from "@/app/brand-icon";

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
  availableCount: number;
  totalCount: number;
}


const BASKET_SCENES: Record<string, string> = {
  "Aerospace & Defense": "aerospace-defense",
  "AI & Semiconductors": "ai-semiconductors",
  "Banks & Financials": "banks-financials",
  "Broad Index Trackers": "broad-index-trackers",
  "Cloud & Enterprise Software": "cloud-enterprise-software",
  "Consumer Staples & Retail": "consumer-staples-retail",
  "Crypto & Digital Assets Proxies": "crypto-digital-assets",
  "EV & Mobility": "ev-mobility",
  "Fintech & Payments": "fintech-payments",
  "Healthcare & Pharma": "healthcare-pharma",
  "Magnificent Seven": "magnificent-seven",
  "Media & Entertainment": "media-entertainment",
  "Precious Metals": "precious-metals",
  "Treasuries & Private Credit": "treasuries-private-credit",
};

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
      <div className="dash-hero dash-hero--baskets">
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
            {baskets.map((basket, index) => {
              const scene = BASKET_SCENES[basket.name] ?? "broad-index-trackers";
              const availability = basket.totalCount > 0
                ? Math.round((basket.availableCount / basket.totalCount) * 100)
                : 0;
              const cardStyle = {
                "--basket-photo": `url("/images/basket-scenes/${scene}.webp")`,
                "--basket-angle": `${availability * 3.6}deg`,
              } as CSSProperties;

              return (
                <Link
                  key={basket.id}
                  href={`/rwa/app/baskets/${basket.id}`}
                  className="dash-basket-card dash-basket-card--cinematic"
                  style={cardStyle}
                >
                  <div className="dash-basket-card-index">{String(index + 1).padStart(2, "0")}</div>
                  <div className="dash-basket-card-head">
                    <div>
                      <h4>{basket.name}</h4>
                      <p>{basket.description}</p>
                    </div>
                    <span className="dash-basket-kind">{basket.kind}</span>
                  </div>
                  <div className="dash-basket-instrument">
                    <div className="dash-basket-allocation" aria-label={`${availability}% tradeable`}>
                      <span>{basket.availableCount}/{basket.totalCount}</span>
                    </div>
                    <div className="landing2-mockup-chips">
                      {basket.holdings.map((h) => (
                        <span className="landing2-mockup-chip" key={h.ticker}>
                          <BrandIcon symbol={h.ticker} kind="ticker" size={16} />
                          {h.ticker}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="dash-basket-foot">
                    <span className={basket.availableCount === 0 ? "desk-change-neg" : basket.availableCount < basket.totalCount ? "desk-change-flat" : "desk-change-pos"}>
                      {basket.availableCount}/{basket.totalCount} tradeable on Robinhood Chain
                    </span>
                    <span>Open basket</span>
                  </div>
                </Link>
              );
            })}
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
