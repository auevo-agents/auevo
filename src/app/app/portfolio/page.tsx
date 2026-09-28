"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatUnits, type Address } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { ConnectButton } from "../connect-button";
import { BrandIcon } from "../../brand-icon";
import { ERC20_ABI } from "@/lib/erc20-abi";
import { ERC4626_ABI } from "@/lib/erc4626-abi";
import { USDG_DECIMALS } from "@/lib/rwa/dex/addresses";
import { MORPHO_USDG_VAULTS } from "@/lib/rwa/morpho-vaults";
import { robinhoodChain } from "@/lib/chains";
import { formatUsdCompact } from "@/lib/format";

/**
 * "Portfolio" (RWA_SPEC.md section 6: /app/portfolio) — a rollup across
 * every Auevo product a connected wallet actually holds something in,
 * read directly on-chain (balanceOf/convertToAssets), not derived from
 * this app's own swap indexer the way /app/wallets/[address]'s "RWA
 * Portfolio" section is. That distinction matters: the indexer only ever
 * knows about a token once it has SEEN this wallet trade it in its own
 * (rolling, partial) window, so a real holding bought before that window,
 * received by transfer, or bought through a basket never showed up there.
 * A direct balanceOf across every verified Robinhood-Chain token has no
 * such blind spot — this reads what the wallet actually holds right now.
 *
 * Baskets (RWA_SPEC.md Phase 7) aren't a separate vault-share token here —
 * see baskets.ts's own doc comment: a basket is a target-weight bundle of
 * the same individual RWA tokens counted below, held directly in this
 * wallet, not custodied by a contract. Showing a separate "Baskets" total
 * would double-count the same holdings, so this page doesn't invent one;
 * /app/baskets itself is where "does this wallet still match a basket's
 * target weights" gets answered.
 */
export default function PortfolioPage() {
  const { address: account, isConnected } = useAccount();

  const [assets, setAssets] = useState<RawAsset[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/rwa/assets")
      .then((res) => res.json())
      .then((data: { assets?: RawAsset[] }) => {
        if (!cancelled) setAssets(data.assets ?? []);
      })
      .catch(() => {
        if (!cancelled) setAssets([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const robinhoodTokens = useMemo(() => {
    if (!assets) return [];
    return assets
      .map((a) => {
        const onChain = a.tokens.find((t) => t.chainId === robinhoodChain.id);
        if (!onChain) return null;
        return {
          ticker: a.ticker,
          name: a.name,
          address: onChain.address as Address,
          decimals: onChain.decimals,
          priceUsd: onChain.priceUsd ?? a.primaryPriceUsd,
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);
  }, [assets]);

  const holdingsReads = useReadContracts({
    allowFailure: true,
    contracts: robinhoodTokens.map((t) => ({
      address: t.address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account ?? "0x0000000000000000000000000000000000000000"],
    })) as never[],
    query: { enabled: Boolean(account) && robinhoodTokens.length > 0 },
  });

  const rwaHoldings = useMemo(() => {
    return robinhoodTokens
      .map((t, i) => {
        const raw = holdingsReads.data?.[i]?.result;
        if (typeof raw !== "bigint" || raw <= 0n) return null;
        const balance = Number(formatUnits(raw, t.decimals));
        const valueUsd = t.priceUsd !== null ? balance * t.priceUsd : null;
        return { ...t, balance, valueUsd };
      })
      .filter((h): h is NonNullable<typeof h> => h !== null)
      .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
  }, [robinhoodTokens, holdingsReads.data]);

  const rwaTotalUsd = useMemo(() => rwaHoldings.reduce((sum, h) => sum + (h.valueUsd ?? 0), 0), [rwaHoldings]);
  const rwaLoaded = holdingsReads.isSuccess || holdingsReads.isError;

  const sharesReads = useReadContracts({
    allowFailure: true,
    contracts: MORPHO_USDG_VAULTS.map((v) => ({
      address: v.address,
      abi: ERC4626_ABI,
      functionName: "balanceOf",
      args: [account ?? "0x0000000000000000000000000000000000000000"],
    })) as never[],
    query: { enabled: Boolean(account) },
  });
  const sharesByVault = MORPHO_USDG_VAULTS.map((v, i) => ({ vault: v, shares: sharesReads.data?.[i]?.result as bigint | undefined }));
  const heldVaults = sharesByVault.filter((s) => typeof s.shares === "bigint" && s.shares > 0n);

  const assetsReads = useReadContracts({
    allowFailure: true,
    contracts: heldVaults.map((s) => ({
      address: s.vault.address,
      abi: ERC4626_ABI,
      functionName: "convertToAssets",
      args: [s.shares as bigint],
    })) as never[],
    query: { enabled: heldVaults.length > 0 },
  });

  const lendingPositions = useMemo(() => {
    return heldVaults
      .map((s, i) => {
        const assetsRaw = assetsReads.data?.[i]?.result as bigint | undefined;
        if (typeof assetsRaw !== "bigint") return null;
        return { vault: s.vault, assetsUsdg: Number(formatUnits(assetsRaw, USDG_DECIMALS)) };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => b.assetsUsdg - a.assetsUsdg);
  }, [heldVaults, assetsReads.data]);

  const lendingTotalUsd = useMemo(() => lendingPositions.reduce((sum, p) => sum + p.assetsUsdg, 0), [lendingPositions]);
  const lendingLoaded = sharesReads.isSuccess || sharesReads.isError;

  const totalUsd = rwaTotalUsd + lendingTotalUsd;

  return (
    <>
      <header className="product-header product-header--portfolio">
        <div>
          <h3>Portfolio</h3>
          <p>Everything this wallet holds across Auevo — tokenized stocks and Earn deposits, read live on-chain</p>
        </div>
        <ConnectButton />
      </header>

      {!isConnected && (
        <div className="dash-list-card" style={{ marginTop: 20, padding: 28, textAlign: "center" }}>
          <p style={{ margin: "0 0 20px", fontSize: 14, lineHeight: 1.7, color: "var(--muted)" }}>
            Connect a wallet to see your RWA holdings in USD — cost basis, mark price and unrealized PnL for
            every tokenized stock you hold on Robinhood Chain, plus your Earn deposits and recent activity.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <ConnectButton />
            <Link href="/app/assets" className="landing-cta-ghost">
              Browse assets
            </Link>
          </div>
        </div>
      )}

      {isConnected && account && (
        <>
          <div className="dash-stat-strip" style={{ margin: "20px 0" }}>
            <div className="dash-stat">
              <div className="dash-stat-value">{totalUsd > 0 ? formatUsdCompact(totalUsd) : rwaLoaded && lendingLoaded ? "$0" : "…"}</div>
              <div className="dash-stat-label">TOTAL PORTFOLIO</div>
            </div>
            <div className="dash-stat">
              <div className="dash-stat-value">{rwaLoaded ? formatUsdCompact(rwaTotalUsd) : "…"}</div>
              <div className="dash-stat-label">RWA HOLDINGS</div>
            </div>
            <div className="dash-stat">
              <div className="dash-stat-value">{lendingLoaded ? formatUsdCompact(lendingTotalUsd) : "…"}</div>
              <div className="dash-stat-label">EARN (MORPHO)</div>
            </div>
            <div className="dash-stat">
              <div className="dash-stat-value">{rwaHoldings.length || "—"}</div>
              <div className="dash-stat-label">ASSETS HELD</div>
            </div>
          </div>

          <div className="token-side-card" style={{ marginTop: 20 }}>
            <div className="portfolio-section-head">
              <h4>RWA Holdings</h4>
              <Link href="/app/assets" className="app-link-button">
                Browse assets →
              </Link>
            </div>

            {!rwaLoaded && <p className="app-empty">Loading balances…</p>}

            {rwaLoaded && rwaHoldings.length === 0 && (
              <div className="portfolio-empty">
                <p className="desk-note">No tokenized stocks in this wallet yet.</p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link href="/app/swap" className="landing-cta-ghost">
                    Swap into one
                  </Link>
                  <Link href="/app/baskets" className="landing-cta-ghost">
                    Buy a basket
                  </Link>
                </div>
              </div>
            )}

            {rwaHoldings.length > 0 && (
              <div className="desk-scroll">
                <div className="money-row money-row-nopair money-head">
                  <span>ASSET</span>
                  <span className="desk-col-right">BALANCE</span>
                  <span className="desk-col-right">VALUE</span>
                </div>
                {rwaHoldings.map((h) => (
                  <Link key={h.address} href={`/app/assets/${h.ticker}`} className="money-row money-row-nopair money-row-link">
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <BrandIcon symbol={h.ticker} size={22} />
                      <b>{h.ticker}</b>
                    </span>
                    <span className="desk-col-right">{h.balance.toFixed(4)}</span>
                    <span className="desk-col-right">{h.valueUsd !== null ? formatUsdCompact(h.valueUsd) : "—"}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="token-side-card" style={{ marginTop: 20 }}>
            <div className="portfolio-section-head">
              <h4>Earn (Morpho)</h4>
              <Link href="/app/lend" className="app-link-button">
                Open Earn →
              </Link>
            </div>

            {!lendingLoaded && <p className="app-empty">Loading balances…</p>}

            {lendingLoaded && lendingPositions.length === 0 && (
              <div className="portfolio-empty">
                <p className="desk-note">Not depositing into any Earn vault yet.</p>
                <Link href="/app/lend" className="landing-cta-ghost">
                  Start earning on USDG
                </Link>
              </div>
            )}

            {lendingPositions.length > 0 && (
              <div className="desk-scroll">
                <div className="money-row money-row-nopair money-head">
                  <span>VAULT</span>
                  <span className="desk-col-right">CURATOR</span>
                  <span className="desk-col-right">VALUE</span>
                </div>
                {lendingPositions.map((p) => (
                  <div key={p.vault.address} className="money-row money-row-nopair">
                    <span>
                      <b>{p.vault.name}</b>
                    </span>
                    <span className="desk-col-right">{p.vault.curator}</span>
                    <span className="desk-col-right">{formatUsdCompact(p.assetsUsdg)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="token-side-card" style={{ marginTop: 20, textAlign: "center" }}>
            <p className="desk-note" style={{ margin: 0 }}>
              Looking for swap history, realized/unrealized PnL, or this wallet&apos;s recent on-chain activity?
            </p>
            <Link href={`/app/wallets/${account}`} className="app-link-button">
              View full wallet activity →
            </Link>
          </div>
        </>
      )}
    </>
  );
}

interface RawAssetToken {
  chainId: number;
  address: string;
  decimals: number;
  priceUsd: number | null;
}

interface RawAsset {
  ticker: string;
  name: string;
  primaryPriceUsd: number | null;
  tokens: RawAssetToken[];
}
