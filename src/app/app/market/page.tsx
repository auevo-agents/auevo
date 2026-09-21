"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "../connect-button";
import {
  formatAge,
  formatPercent,
  formatPrice,
  formatUsdCompact,
  shortenAddress,
} from "@/lib/format";
import type { MarketPool } from "@/lib/geckoterminal";

/**
 * The Market screener — live pools on Robinhood Chain, priced and ranked
 * from GeckoTerminal's On-Chain DEX API (see src/lib/geckoterminal.ts for
 * why: it already indexes this chain, and gives real price/liquidity/
 * volume/market-cap, which decoding Uniswap's own PoolCreated events off
 * Blockscout never could — that only ever proved a pool exists).
 *
 * Deliberately does not show a BLUE CHIP / SAFE / CAUTION-style verdict
 * tag: that would need an actual risk assessment per token, and doing
 * that for every row of a live-updating list either means faking it or
 * running the full Token Scanner on every pool on every poll, which isn't
 * viable. The one tag shown here (NEW) is a plain fact about pool age,
 * not a judgment — the "scan" link is how you actually get a verdict.
 */

type Tab = "all" | "gainers" | "losers" | "radar";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "gainers", label: "GAINERS" },
  { id: "losers", label: "LOSERS" },
  { id: "radar", label: "RADAR · NEW PAIRS" },
];

function useMarketPools(kind: "all" | "radar") {
  const [pools, setPools] = useState<MarketPool[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/market/pools?tab=${kind}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not load market data");
          return;
        }
        setPools(data.pools);
        setError(null);
      } catch {
        if (!cancelled) setError("Network error loading market data");
      }
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [kind]);

  return { pools, error };
}

export default function MarketPage() {
  const [tab, setTab] = useState<Tab>("all");
  const { pools: rawPools, error } = useMarketPools(tab === "radar" ? "radar" : "all");

  const pools = useMemo(() => {
    if (!rawPools) return null;
    if (tab === "gainers") {
      return [...rawPools].sort(
        (a, b) => (b.change.h24 ?? -Infinity) - (a.change.h24 ?? -Infinity)
      );
    }
    if (tab === "losers") {
      return [...rawPools].sort(
        (a, b) => (a.change.h24 ?? Infinity) - (b.change.h24 ?? Infinity)
      );
    }
    return rawPools;
  }, [rawPools, tab]);

  return (
    <>
      <header className="product-header">
        <div>
          <h3>Market</h3>
          <p>Live pools on Robinhood Chain · Uniswap · data via GeckoTerminal</p>
        </div>
        <ConnectButton />
      </header>

      <div className="desk-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "desk-tab active" : "desk-tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="error" style={{ marginTop: 4 }}>
          {error}
        </p>
      )}

      {!pools && !error && <div className="app-empty">Loading market data…</div>}

      {pools && pools.length === 0 && (
        <div className="app-empty">
          {tab === "radar" ? "No new pools found yet." : "No pools found yet."}
        </div>
      )}

      {pools && pools.length > 0 && (
        <div className="desk-scroll">
          <div className="desk-row desk-head">
            <span>PAIR</span>
            <span className="desk-col-right">PRICE</span>
            <span className="desk-col-right">5M</span>
            <span className="desk-col-right">1H</span>
            <span className="desk-col-right">6H</span>
            <span className="desk-col-right">24H</span>
            <span className="desk-col-right">LIQUIDITY</span>
            <span className="desk-col-right">MCAP</span>
            <span className="desk-col-right">VOL 24H</span>
            <span className="desk-col-right">TXNS 24H</span>
            <span className="desk-col-right">AGE</span>
            <span />
          </div>

          {pools.map((pool) => (
            <PoolRow key={pool.id} pool={pool} />
          ))}
        </div>
      )}

      <p className="desk-note">
        Price, liquidity, volume, market cap and 24h change come live from{" "}
        <a
          href="https://www.geckoterminal.com/robinhood/pools"
          target="_blank"
          rel="noreferrer"
        >
          GeckoTerminal
        </a>
        , not computed by us. No safety verdict is shown here — run a
        token through the <Link href="/scanner">Token Scanner</Link> before
        trusting it.
      </p>
    </>
  );
}

function changeClass(value: number | null): string {
  if (value === null || value === 0) return "desk-change-flat";
  return value > 0 ? "desk-change-pos" : "desk-change-neg";
}

function McapCell({ pool }: { pool: MarketPool }) {
  if (pool.marketCapUsd !== null) return <>{formatUsdCompact(pool.marketCapUsd)}</>;
  if (pool.fdvUsd !== null) {
    return (
      <>
        {formatUsdCompact(pool.fdvUsd)}{" "}
        <small style={{ color: "#5a6469" }}>FDV</small>
      </>
    );
  }
  return <>—</>;
}

function PoolRow({ pool }: { pool: MarketPool }) {
  const base = pool.baseToken;
  const quote = pool.quoteToken;
  const isNew = pool.ageSeconds !== null && pool.ageSeconds < 3600;
  const detailHref = pool.poolAddress ? `/app/market/t/${pool.poolAddress}` : "#";

  return (
    <div className="desk-row">
      <Link href={detailHref} className="desk-pair">
        {base.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={base.imageUrl} alt="" className="desk-pair-icon" />
        ) : (
          <span className="desk-pair-icon" />
        )}
        <span className="desk-pair-symbols">
          <span className="desk-pair-base">
            {base.symbol ?? (base.address ? shortenAddress(base.address) : "?")}
            {isNew && <span className="desk-tag-new">NEW</span>}
          </span>
          <small>
            {quote.symbol ?? "?"} · {pool.dexName ?? "Uniswap V3"}
          </small>
        </span>
      </Link>

      <span className="desk-col-right">{formatPrice(pool.priceUsd)}</span>
      <span className={`desk-col-right ${changeClass(pool.change.m5)}`}>
        {formatPercent(pool.change.m5)}
      </span>
      <span className={`desk-col-right ${changeClass(pool.change.h1)}`}>
        {formatPercent(pool.change.h1)}
      </span>
      <span className={`desk-col-right ${changeClass(pool.change.h6)}`}>
        {formatPercent(pool.change.h6)}
      </span>
      <span className={`desk-col-right ${changeClass(pool.change.h24)}`}>
        {formatPercent(pool.change.h24)}
      </span>
      <span className="desk-col-right">{formatUsdCompact(pool.liquidityUsd)}</span>
      <span className="desk-col-right">
        <McapCell pool={pool} />
      </span>
      <span className="desk-col-right">{formatUsdCompact(pool.volumeUsd24h)}</span>
      <span className="desk-col-right">
        {pool.txns24h ? `${pool.txns24h.buys ?? 0}/${pool.txns24h.sells ?? 0}` : "—"}
      </span>
      <span className="desk-col-right">{formatAge(pool.ageSeconds)}</span>

      <span className="desk-actions">
        {base.address && <Link href={`/scanner?token=${base.address}`}>scan</Link>}
        {base.address && quote.address && (
          <Link
            href={`/app/trading?tokenIn=${quote.address}&tokenOut=${base.address}`}
            className="desk-trade-link"
          >
            trade
          </Link>
        )}
      </span>
    </div>
  );
}
