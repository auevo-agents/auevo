"use client";

import Link from "next/link";
import { formatUnits } from "viem";
import { useAccount, useBalance } from "wagmi";
import { robinhoodChain } from "@/lib/chains";
import { ConnectButton } from "./connect-button";

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

export default function AppOverviewPage() {
  const { address, isConnected, chainId } = useAccount();
  const balance = useBalance({
    address,
    chainId: robinhoodChain.id,
    query: { enabled: Boolean(address) },
  });

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

      <div className="app-tools">
        <div className="scan-section-heading">
          <span>READY NOW</span>
          <strong>Tools already live</strong>
        </div>

        <div className="app-tool-cards">
          <Link href="/scanner" className="app-tool-card">
            <strong>Token Scanner</strong>
            <p>
              Contract security checks on Robinhood Chain — mint, pause,
              blacklist, proxy, liquidity.
            </p>
          </Link>
          <Link href="/legacy/fees" className="app-tool-card">
            <strong>Fee Scanner (legacy)</strong>
            <p>How much a Solana wallet has paid trading bots in fees.</p>
          </Link>
        </div>
      </div>
    </>
  );
}
