"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ConnectButton } from "../connect-button";
import { SwapPanel } from "../swap-panel";
import { LpPanel } from "../lp-panel";
import { formatUsdCompact, formatPrice, shortenAddress } from "@/lib/format";
import type { MarketPool } from "@/lib/geckoterminal";

/**
 * DEX — Swap plus the other liquidity-side tools that belong next to it
 * (Pools, LP, Token Locker), instead of a standalone "Trading" page that
 * was really just Swap wearing a bigger name. Swap is the only one doing
 * anything today; the other tabs say plainly what's real and what isn't
 * rather than showing a working-looking control that does nothing.
 */

type Tab = "swap" | "pools" | "lp" | "locker";

const TABS: { id: Tab; label: string }[] = [
  { id: "swap", label: "Swap" },
  { id: "pools", label: "Pools" },
  { id: "lp", label: "LP" },
  { id: "locker", label: "Token Locker" },
];

export default function DexPage() {
  return (
    <Suspense fallback={null}>
      <DexApp />
    </Suspense>
  );
}

function DexApp() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("swap");

  return (
    <>
      <header className="product-header product-header--trading">
        <div>
          <h3>DEX</h3>
          <p>Swap, pools and liquidity tools · Robinhood Chain</p>
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

      {tab === "swap" && (
        <>
          <div className="app-notice app-notice-info">
            Routed through Uniswap&apos;s own SwapRouter02 on Robinhood Chain — not
            a contract of ours. You approve and sign every step in your own wallet.
            Native ETH and ERC-20 pairs both work.
          </div>

          <div className="trade-panel">
            <SwapPanel
              initialTokenIn={searchParams.get("tokenIn") ?? ""}
              initialTokenOut={searchParams.get("tokenOut") ?? ""}
            />
          </div>
        </>
      )}

      {tab === "pools" && <PoolsTab />}

      {tab === "lp" && (
        <>
          <div className="app-notice app-notice-info">
            Full-range liquidity provision on any live Uniswap V3 pool on Robinhood Chain,
            routed through Uniswap&apos;s own NonfungiblePositionManager — not custom Solidity
            of ours. Removing liquidity isn&apos;t wired up yet; see{" "}
            <button onClick={() => setTab("pools")}>Pools</button> for what already has
            liquidity on this chain.
          </div>
          <LpPanel />
        </>
      )}

      {tab === "locker" && (
        <div className="app-empty app-empty-text">
          <p>
            A token/LP locker means a timelock contract holding tokens until a
            release date — custom Solidity, not an existing audited primitive
            to integrate with the way Swap routes through Uniswap. Worth
            designing and reviewing properly before real value sits in it,
            same reasoning as <Link href="/app/otc">OTC Desk</Link> and{" "}
            <Link href="/app/launch">Launchpad</Link>. Not wired up yet.
          </p>
        </div>
      )}
    </>
  );
}

function PoolsTab() {
  const [pools, setPools] = useState<MarketPool[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/market/pools?tab=all&pages=1");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not load pools");
          return;
        }
        const sorted = [...(data.pools as MarketPool[])].sort(
          (a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0)
        );
        setPools(sorted.slice(0, 30));
        setError(null);
      } catch {
        if (!cancelled) setError("Network error loading pools");
      }
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (error) return <p className="error" style={{ marginTop: 4 }}>{error}</p>;
  if (!pools) return <div className="app-empty">Loading pools…</div>;
  if (pools.length === 0) return <div className="app-empty">No live pools found.</div>;

  return (
    <>
      <div className="desk-scroll">
        <div className="pools-row pools-head">
          <span>Pair</span>
          <span>DEX</span>
          <span>Price</span>
          <span>Liquidity</span>
          <span>Volume 24h</span>
        </div>
        {pools.map((pool) => (
          <Link
            key={pool.id}
            href={pool.poolAddress ? `/app/market/t/${pool.poolAddress}` : "#"}
            className="pools-row"
          >
            <span>
              {pool.baseToken.symbol ?? "?"} / {pool.quoteToken.symbol ?? "?"}
              {pool.baseToken.address && (
                <small style={{ marginLeft: 6, color: "#5a6469" }}>
                  {shortenAddress(pool.baseToken.address, 4, 4)}
                </small>
              )}
            </span>
            <span>{pool.dexName ?? "Uniswap V3"}</span>
            <span>{formatPrice(pool.priceUsd)}</span>
            <span>{formatUsdCompact(pool.liquidityUsd)}</span>
            <span>{formatUsdCompact(pool.volumeUsd24h)}</span>
          </Link>
        ))}
      </div>

      <p className="desk-note">
        Every live Uniswap V3 pool on Robinhood Chain, by liquidity — read-only,
        the same data Market uses. Click a pair to trade it or see its full detail
        page.
      </p>
    </>
  );
}
