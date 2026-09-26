"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { PriceChart, type PricePoint } from "../price-chart";
import { SwapPanel } from "../../swap-panel";
import { Disclaimer } from "../../../disclaimer";
import { USDG } from "@/lib/rwa/dex/addresses";
import { robinhoodChain } from "@/lib/chains";

/**
 * RWA_SPEC.md Phase 3's asset detail page. The swap card only appears for
 * the Robinhood Chain listing (Phase 2 built that path); every other
 * chain's row links to /app/swap's Bridge tab instead (Phase 4), prefilled
 * with that row's chain/token via query params — see swap/page.tsx.
 */

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  56: "BNB Chain",
  196: "X Layer",
  999: "HyperEVM",
  5000: "Mantle",
  8453: "Base",
  42161: "Arbitrum",
  57073: "Ink",
  [robinhoodChain.id]: "Robinhood Chain",
};

function chainName(chainId: number): string {
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;
}

interface AssetToken {
  chainId: number;
  address: string;
  issuerId: string;
  symbol: string;
  decimals: number;
  priceUsd: number | null;
  premiumBps: number | null;
  priceAsOf: string | null;
  riskScore: number | null;
}

interface Issuer {
  id: string;
  name: string;
  website: string | null;
  description: string | null;
  backing_note: string | null;
  suffix: string | null;
}

interface AssetDetail {
  indexed: boolean;
  ticker: string;
  name: string;
  category: string;
  exchange: string | null;
  referenceConfigured: boolean;
  tokens: AssetToken[];
  primaryChainId: number | null;
  primaryAddress: string | null;
  priceHistory: PricePoint[];
  issuers: Issuer[];
}

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

export default function AssetDetailPage({ params }: PageProps<"/app/assets/[ticker]">) {
  const { ticker } = use(params);
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/rwa/assets/${encodeURIComponent(ticker)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not load this asset");
          return;
        }
        setAsset(data);
      } catch {
        if (!cancelled) setError("Network error loading this asset");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (error) {
    return (
      <>
        <header className="product-header">
          <div>
            <h3>{ticker}</h3>
          </div>
        </header>
        <p className="error">{error}</p>
        <p>
          <Link href="/app/assets">← Back to Assets</Link>
        </p>
      </>
    );
  }

  if (!asset) {
    return <div className="app-empty">Loading…</div>;
  }

  if (!asset.indexed) {
    return <div className="app-empty">The asset registry isn&apos;t connected yet.</div>;
  }

  const robinhoodToken = asset.tokens.find((t) => t.chainId === robinhoodChain.id);
  const hasPriceHistory = asset.priceHistory.some((p) => p.priceUsd !== null);

  return (
    <>
      <header className="product-header">
        <div>
          <h3>
            {asset.ticker} <span style={{ color: "#5a6469", fontWeight: 400 }}>· {asset.name}</span>
          </h3>
          <p>
            {asset.category.toUpperCase()}
            {asset.exchange ? ` · ${asset.exchange}` : ""}
            {!asset.referenceConfigured && " · no reference price source configured yet — premium unavailable"}
          </p>
        </div>
      </header>

      {hasPriceHistory ? (
        <div className="asset-chart-wrap">
          <PriceChart points={asset.priceHistory} />
        </div>
      ) : (
        <div className="app-empty">No price history yet — the price cron hasn&apos;t run for this asset.</div>
      )}

      {robinhoodToken && (
        <div style={{ maxWidth: 420, marginTop: 16 }}>
          <h4 style={{ marginBottom: 8 }}>Trade on Robinhood Chain</h4>
          <SwapPanel initialTokenIn={USDG} initialTokenOut={robinhoodToken.address} lockPair />
        </div>
      )}

      <h4 style={{ marginTop: 24 }}>Every issuer · chain</h4>
      <div className="desk-scroll asset-token-matrix">
        <div className="money-row money-row-nopair money-head">
          <span>ISSUER · CHAIN</span>
          <span className="desk-col-right">SYMBOL</span>
          <span className="desk-col-right">PRICE</span>
          <span className="desk-col-right">PREMIUM</span>
          <span className="desk-col-right">RISK</span>
          <span />
        </div>
        {asset.tokens.map((t) => {
          const premium = formatPremium(t.premiumBps);
          const isRobinhood = t.chainId === robinhoodChain.id;
          return (
            <div key={`${t.chainId}-${t.address}`} className="money-row money-row-nopair">
              <span>
                <b>{t.issuerId}</b>
                <br />
                <small style={{ color: "#5a6469" }}>{chainName(t.chainId)}</small>
              </span>
              <span className="desk-col-right">{t.symbol}</span>
              <span className="desk-col-right">{formatUsd(t.priceUsd)}</span>
              <span className={`desk-col-right ${premium.className}`}>{premium.text}</span>
              <span
                className={`desk-col-right ${t.riskScore === null ? "" : t.riskScore >= 70 ? "desk-change-pos" : t.riskScore >= 40 ? "" : "desk-change-neg"}`}
              >
                {t.riskScore ?? "—"}
              </span>
              <span className="desk-actions">
                {isRobinhood ? (
                  <a href="#top">trade ↑</a>
                ) : (
                  <Link href={`/app/swap?mode=bridge&toChain=${t.chainId}&toToken=${t.address}`} title={`Bridge into ${chainName(t.chainId)} to buy this`}>
                    bridge →
                  </Link>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {asset.issuers.length > 0 && (
        <>
          <h4 style={{ marginTop: 24 }}>Issuers</h4>
          <div className="issuer-card-grid">
            {asset.issuers.map((issuer) => (
              <article key={issuer.id} className="issuer-card">
                <h4>{issuer.name}</h4>
                {issuer.backing_note && <p>{issuer.backing_note}</p>}
                {issuer.website && (
                  <a href={issuer.website} target="_blank" rel="noreferrer">
                    website ↗
                  </a>
                )}
              </article>
            ))}
          </div>
        </>
      )}

      <Disclaimer />
    </>
  );
}
