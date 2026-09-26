"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The one nav-item list for the whole /app workspace. Every page used to
 * define its own copy of this array and its own <aside> markup — nothing
 * kept them in sync, so pages drifted to showing different subsets of
 * links. Rendered once from the shared layout instead, so there is only
 * one list to ever update.
 *
 * RWA_SPEC.md (docs/RWA_SPEC.md) section 6 defines the target section
 * list for the marketplace+scanner rebuild. Phase 0 adds every one of
 * those routes now (`soon: true` where there's nothing behind it yet —
 * rendered via coming-soon.tsx) rather than growing the nav one phase at
 * a time, per the spec's own phase-0 "done" bar. Pre-RWA sections that
 * are NOT on RWA_SPEC.md's excess list (Market, Smart Money, DEX, Bots,
 * Wallets) stay — they're generic Robinhood-chain tooling the RWA build
 * reuses or extends (e.g. DEX's Swap tab gets the v4+USDG upgrade in
 * Phase 2; Bots is the DCA vault Phase 7 adapts), not memecoin-only code.
 * OTC Desk and Launchpad are on that excess list and are dropped here
 * (pages left in place, just unreachable from the nav — see RWA_SPEC.md
 * section 4: "код удаляем только в фазе 0 и только то, что перечислено",
 * and neither is listed for deletion, only removal from nav).
 */
export const NAV_ITEMS: {
  id: string;
  label: string;
  href: string;
  soon?: boolean;
}[] = [
  { id: "overview", label: "Overview", href: "/app" },
  { id: "assets", label: "Assets", href: "/app/assets" },
  { id: "market", label: "Market", href: "/app/market" },
  { id: "smart-money", label: "Smart Money", href: "/app/smart-money" },
  { id: "dex", label: "DEX", href: "/app/trading" },
  { id: "swap", label: "Swap", href: "/app/swap" },
  { id: "bots", label: "Bots", href: "/app/bots" },
  { id: "baskets", label: "Baskets", href: "/app/baskets", soon: true },
  { id: "pools", label: "Pools", href: "/app/pools", soon: true },
  { id: "lend", label: "Lend", href: "/app/lend", soon: true },
  { id: "issuers", label: "Issuers", href: "/app/issuers" },
  { id: "scanner", label: "Scanner", href: "/app/scanner", soon: true },
  { id: "explorer", label: "Explorer", href: "/app/explorer" },
  { id: "portfolio", label: "Portfolio", href: "/app/portfolio" },
  { id: "wallets", label: "Wallets", href: "/app/wallets" },
];

// Token Scanner (/scanner) and Fee Scanner (/legacy/fees) live outside
// this nav on purpose — both are public-site pages with their own chrome
// (marketing header, or fees' own hand-rolled result view), and Fee
// Scanner reads a *Solana* wallet's bot fees, nothing to do with
// Robinhood Chain. /app/scanner above is the new RWA scanner from
// RWA_SPEC.md section 6 (premium/arbitrage/risk/liquidity/new/smart
// money tabs) — a different, EVM-native tool, built in Phase 5.

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Top navigation bar for the /app workspace — a horizontal row (logo left,
 * links in a line), matching how the market leaders (Axiom, nlyra) lay out
 * their own app chrome, instead of the left sidebar this used to be.
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <header className="app-topnav">
      <Link href="/app" className="app-topnav-logo">
        <strong>auevo</strong>
        <i />
      </Link>

      <nav className="app-topnav-links">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={
              isActive(pathname, item.href)
                ? "app-nav-link active"
                : "app-nav-link"
            }
          >
            <b>{item.label}</b>
            {item.soon && <span className="app-nav-badge">soon</span>}
          </Link>
        ))}
      </nav>
    </header>
  );
}
