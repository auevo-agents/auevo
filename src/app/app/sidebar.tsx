"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AuevoLogo } from "../auevo-logo";

interface NavLink {
  id: string;
  label: string;
  href: string;
  soon?: boolean;
}

interface NavGroup {
  id: string;
  label: string;
  links: NavLink[];
}

/**
 * Grouped instead of one flat 14-item strip — the flat version forced a
 * horizontal scroll on anything narrower than a wide desktop, and gave no
 * sense of which tools relate to which. Same three groups as the public
 * landing page's own "Explore" menu (Trade / Build / Track) for one
 * consistent mental model across the marketing site and the workspace.
 *
 * `baskets`/`pools`/`lend` no longer carry `soon: true` — that flag dates
 * to Phase 0's placeholder scaffolding; Phases 7-8 built all three for
 * real (see docs/RWA_SPEC.md), so the badge was stale, not honest.
 *
 * Pre-RWA sections (Market, Smart Money, DEX, Bots, Wallets, Explorer)
 * stay in the nav — generic Robinhood-chain tooling the RWA build reuses
 * or extends, not memecoin-only code (see RWA_SPEC.md section 4). OTC
 * Desk and Launchpad remain off this list on purpose (pages left in
 * place, just unreachable from the nav).
 */
const NAV_GROUPS: NavGroup[] = [
  {
    id: "trade",
    label: "Trade",
    links: [
      { id: "assets", label: "Assets", href: "/app/assets" },
      { id: "issuers", label: "Issuers", href: "/app/issuers" },
      { id: "scanner", label: "Scanner", href: "/app/scanner" },
      { id: "swap", label: "Swap & Bridge", href: "/app/swap" },
      { id: "market", label: "Market", href: "/app/market" },
      { id: "dex", label: "DEX", href: "/app/trading" },
    ],
  },
  {
    id: "build",
    label: "Build",
    links: [
      { id: "baskets", label: "Baskets", href: "/app/baskets" },
      { id: "pools", label: "Pools", href: "/app/pools" },
      { id: "lend", label: "Lend", href: "/app/lend" },
      { id: "bots", label: "Bots", href: "/app/bots" },
    ],
  },
  {
    id: "track",
    label: "Track",
    links: [
      { id: "portfolio", label: "Portfolio", href: "/app/portfolio" },
      { id: "wallets", label: "Wallets", href: "/app/wallets" },
      { id: "smart-money", label: "Smart Money", href: "/app/smart-money" },
      { id: "explorer", label: "Explorer", href: "/app/explorer" },
    ],
  },
  {
    id: "more",
    label: "More",
    links: [
      { id: "token-scanner", label: "Token Scanner", href: "/scanner" },
      { id: "fee-scanner", label: "Fee Scanner (legacy)", href: "/legacy/fees" },
      { id: "docs", label: "Docs", href: "/docs" },
    ],
  },
];

// Token Scanner (/scanner) and Fee Scanner (/legacy/fees) sit in their own
// "More" group rather than mixed into Trade/Build/Track: both are
// pre-RWA tools that keep their own page chrome (marketing header, or
// Fee Scanner's own hand-rolled result view) instead of the /app shell,
// and Fee Scanner reads a *Solana* wallet's bot fees, nothing to do with
// Robinhood Chain — grouping them with the RWA tools above would imply
// they're part of the same product. /app/scanner above is the new RWA
// scanner from RWA_SPEC.md section 6 (premium/arbitrage/risk/liquidity/
// new/smart money tabs), a different, EVM-native tool built in Phase 5.

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isGroupActive(pathname: string, group: NavGroup): boolean {
  return group.links.some((link) => isActive(pathname, link.href));
}

/**
 * Top navigation bar for the /app workspace — logo, a direct Overview
 * link, then three grouped dropdowns. A group's trigger stays highlighted
 * whenever the current page is one of its links, so the active section
 * reads at a glance even while its dropdown is closed.
 */
export function Sidebar() {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!openGroup) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenGroup(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenGroup(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openGroup]);

  return (
    <header className="app-topnav" ref={rootRef}>
      <Link href="/app" className="app-topnav-logo" aria-label="Auevo workspace">
        <AuevoLogo />
        <span className="app-topnav-edition">Market intelligence</span>
      </Link>

      <nav className="app-topnav-links">
        <Link href="/app" className={isActive(pathname, "/app") && pathname === "/app" ? "app-nav-link active" : "app-nav-link"}>
          <b>Overview</b>
        </Link>

        {NAV_GROUPS.map((group) => (
          <div className="app-nav-group" key={group.id}>
            <button
              type="button"
              className={isGroupActive(pathname, group) ? "app-nav-link app-nav-group-trigger active" : "app-nav-link app-nav-group-trigger"}
              aria-expanded={openGroup === group.id}
              onClick={() => setOpenGroup((v) => (v === group.id ? null : group.id))}
            >
              <b>{group.label}</b>
              <span className={openGroup === group.id ? "app-nav-caret app-nav-caret-open" : "app-nav-caret"}>▾</span>
            </button>

            {openGroup === group.id && (
              <div className="app-nav-group-panel">
                {group.links.map((link) => (
                  <Link
                    key={link.id}
                    href={link.href}
                    className={isActive(pathname, link.href) ? "app-nav-group-link active" : "app-nav-group-link"}
                    onClick={() => setOpenGroup(null)}
                  >
                    {link.label}
                    {link.soon && <span className="app-nav-badge">soon</span>}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="app-topnav-trust" aria-label="Registry status">
        <span className="app-topnav-trust-dot" />
        <span>Verified registry</span>
      </div>
    </header>
  );
}
