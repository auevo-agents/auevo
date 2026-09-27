"use client";

import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useBalance } from "wagmi";
import { robinhoodChain } from "@/lib/chains";
import { LIFI_EVM_CHAINS } from "@/lib/rwa/lifi/chains";
import { LandingCards } from "../landing-cards";
import { ConnectButton } from "./connect-button";

/**
 * Internal workspace overview — the first real (non-mockup) screen of the
 * platform nlyra.xyz-style buildout is heading toward. Everything on this
 * page is either read-only against the connected wallet's own account or
 * a link to a tool that already exists; nothing here custodies funds.
 *
 * Rebuilt from a near-empty KPI-strip-plus-two-legacy-links page into an
 * actual home screen: real registry stats up top, then the same
 * premium quick-action cards (with embedded mini-mockups) the landing
 * page's own "workspace" section uses, so this reads as a real product
 * home rather than a placeholder. Token Scanner and Fee Scanner (legacy,
 * pre-RWA tools) moved out of the primary flow here into the top nav's
 * Track group — this page's job now is the RWA product, not memecoin
 * leftovers.
 *
 * Not linked from any public page and excluded from the sitemap — see
 * the layout's `robots` metadata. It is reachable by anyone with the
 * URL, same as any page on a public deployment; that is a search-engine
 * request, not a security boundary.
 */

const QUICK_ACTIONS = [
  {
    num: "01",
    title: "Assets",
    body: "Every tokenized stock and ETF this app's registry has found, across every issuer and chain.",
    tag: "Browse",
    href: "/app/assets",
    mockup: "chips",
  },
  {
    num: "02",
    title: "Scanner",
    body: "Premium, arbitrage, contract risk, liquidity depth and new listings — ranked, not just listed.",
    tag: "6 tabs",
    href: "/app/scanner",
    mockup: "compare",
  },
  {
    num: "03",
    title: "Baskets",
    body: "Buy 5–10 stocks in one wallet signature through Uniswap v4.",
    tag: "One signature",
    href: "/app/baskets",
    mockup: "checklist",
  },
  {
    num: "04",
    title: "Pools",
    body: "v4 RWA/USDG pools on Robinhood Chain — liquidity, volume and fee APR.",
    tag: "Uniswap v4",
    href: "/app/pools",
    mockup: "apr",
  },
  {
    num: "05",
    title: "Swap & Bridge",
    body: "Trade on Robinhood Chain, or bridge tokenized assets in from five other chains.",
    tag: "Best route",
    href: "/app/swap",
    mockup: "compare",
  },
  {
    num: "06",
    title: "Portfolio",
    body: "Your RWA holdings in USD, cost basis and unrealized PnL.",
    tag: "Your wallet",
    href: "/app/portfolio",
    mockup: "alert",
  },
] as const;

function useRegistryStats() {
  const [assetCount, setAssetCount] = useState<number | null>(null);
  const [issuerCount, setIssuerCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/rwa/assets?sort=alphabetical")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.assets)) setAssetCount(data.assets.length);
      })
      .catch(() => {});
    fetch("/api/rwa/issuers")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.issuers)) {
          setIssuerCount(data.issuers.filter((i: { tokenCount: number }) => i.tokenCount > 0).length);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return { assetCount, issuerCount };
}

export default function AppOverviewPage() {
  const { address, isConnected, chainId } = useAccount();
  const balance = useBalance({
    address,
    chainId: robinhoodChain.id,
    query: { enabled: Boolean(address) },
  });
  const { assetCount, issuerCount } = useRegistryStats();

  const wrongChain = isConnected && chainId !== robinhoodChain.id;

  return (
    <>
      <header className="product-header">
        <div>
          <h3>Overview</h3>
          <p>Internal workspace · Robinhood Chain</p>
        </div>

        <ConnectButton />
      </header>

      {wrongChain && (
        <div className="app-notice">
          Connected wallet is on a different chain. Switch to{" "}
          {robinhoodChain.name} to see balances here.
        </div>
      )}

      <div className="app-kpis">
        <article className="app-kpi">
          <span>NATIVE BALANCE</span>
          <strong>
            {!isConnected
              ? "—"
              : balance.isLoading
                ? "…"
                : balance.data
                  ? `${Number(
                      formatUnits(balance.data.value, balance.data.decimals),
                    ).toFixed(4)} ${balance.data.symbol}`
                  : "unknown"}
          </strong>
        </article>

        <article className="app-kpi">
          <span>WALLET</span>
          <strong className="scan-mono app-kpi-address">
            {address
              ? `${address.slice(0, 8)}…${address.slice(-6)}`
              : "not connected"}
          </strong>
        </article>

        <article className="app-kpi">
          <span>NETWORK</span>
          <strong>{robinhoodChain.name}</strong>
        </article>
      </div>

      <div className="dash-stat-strip" style={{ margin: "24px 0" }}>
        <div className="dash-stat">
          <div className="dash-stat-value">{assetCount ?? "—"}</div>
          <div className="dash-stat-label">ASSETS TRACKED</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-value">{issuerCount ?? "—"}</div>
          <div className="dash-stat-label">ISSUERS</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-value">{LIFI_EVM_CHAINS.length}</div>
          <div className="dash-stat-label">CHAINS SUPPORTED</div>
        </div>
      </div>

      <div className="app-tools">
        <div className="scan-section-heading">
          <span>QUICK ACTIONS</span>
          <strong>Jump into the product</strong>
        </div>

        <LandingCards cards={QUICK_ACTIONS} />
      </div>
    </>
  );
}
