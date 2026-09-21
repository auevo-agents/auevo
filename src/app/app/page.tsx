"use client";

import Link from "next/link";
import { formatUnits } from "viem";
import { useAccount, useBalance, useConnect, useDisconnect } from "wagmi";
import { robinhoodChain } from "@/lib/chains";

/**
 * Internal workspace overview — the first real (non-mockup) screen of the
 * platform nlyra.xyz-style buildout is heading toward. Everything on this
 * page is either read-only against the connected wallet's own account or
 * a link to a tool that already exists; nothing here custodies funds.
 *
 * Not linked from any public page and excluded from the sitemap — see
 * the layout's `robots` metadata. It is reachable by anyone with the
 * URL, same as any page on a public deployment; that is a search-engine
 * request, not a security boundary.
 */

const NAV_ITEMS: {
  id: string;
  label: string;
  icon: string;
  href?: string;
  soon?: boolean;
}[] = [
  { id: "overview", label: "Overview", icon: "" },
  { id: "scanner", label: "Token Scanner", icon: "nav-analytics", href: "/scanner" },
  { id: "fees", label: "Fee Scanner", icon: "nav-bots", href: "/fees" },
  { id: "trading", label: "Trading", icon: "nav-trading", soon: true },
  { id: "positions", label: "Positions", icon: "nav-position", soon: true },
  { id: "otc", label: "OTC Desk", icon: "nav-copy", soon: true },
  { id: "launch", label: "Launchpad", icon: "nav-alerts", soon: true },
  { id: "wallets", label: "Wallets", icon: "nav-wallet", soon: true },
];

export default function AppOverviewPage() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const balance = useBalance({
    address,
    chainId: robinhoodChain.id,
    query: { enabled: Boolean(address) },
  });

  const wrongChain = isConnected && chainId !== robinhoodChain.id;
  const injectedConnector = connectors.find((c) => c.id === "injected") ?? connectors[0];

  return (
    <main className="app-shell">
      <aside className="product-sidebar">
        <div className="product-logo">
          <strong>auevo</strong>
          <i />
        </div>

        <nav className="product-nav">
          {NAV_ITEMS.map((item) =>
            item.href ? (
              <Link key={item.id} href={item.href} className="app-nav-link">
                <span className={`nav-icon ${item.icon}`}>
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <b>{item.label}</b>
              </Link>
            ) : (
              <button
                key={item.id}
                className={item.id === "overview" ? "active" : undefined}
                disabled={item.soon}
              >
                <span className={`nav-icon ${item.icon}`}>
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <b>{item.label}</b>
                {item.soon && <small className="app-nav-soon">soon</small>}
              </button>
            )
          )}
        </nav>
      </aside>

      <div className="product-main app-main">
        <header className="product-header">
          <div>
            <h3>Overview</h3>
            <p>Internal workspace · Robinhood Chain</p>
          </div>

          <div className="product-header-actions">
            {isConnected && address ? (
              <>
                <button className="wallet-pill" title={address}>
                  <i>{address.slice(2, 3).toUpperCase()}</i>
                  <span>
                    {address.slice(0, 6)}…{address.slice(-4)}
                  </span>
                </button>
                <button onClick={() => disconnect()}>Disconnect</button>
              </>
            ) : (
              <button
                className="app-connect-button"
                disabled={isPending || !injectedConnector}
                onClick={() =>
                  injectedConnector && connect({ connector: injectedConnector })
                }
              >
                {isPending
                  ? "Connecting…"
                  : injectedConnector
                    ? "Connect wallet"
                    : "No wallet found"}
              </button>
            )}
          </div>
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
                        formatUnits(balance.data.value, balance.data.decimals)
                      ).toFixed(4)} ${balance.data.symbol}`
                    : "unknown"}
            </strong>
          </article>

          <article className="app-kpi">
            <span>WALLET</span>
            <strong className="scan-mono app-kpi-address">
              {address ? `${address.slice(0, 8)}…${address.slice(-6)}` : "not connected"}
            </strong>
          </article>

          <article className="app-kpi">
            <span>NETWORK</span>
            <strong>{robinhoodChain.name}</strong>
          </article>
        </div>

        <div className="app-tools">
          <div className="scan-section-heading">
            <span>READY NOW</span>
            <strong>Tools already live</strong>
          </div>

          <div className="app-tool-cards">
            <Link href="/scanner" className="app-tool-card">
              <strong>Token Scanner</strong>
              <p>Contract security checks on Robinhood Chain — mint, pause, blacklist, proxy, liquidity.</p>
            </Link>
            <Link href="/fees" className="app-tool-card">
              <strong>Fee Scanner</strong>
              <p>How much a Solana wallet has paid trading bots in fees.</p>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
