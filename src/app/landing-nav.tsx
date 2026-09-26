"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface NavLink {
  title: string;
  body: string;
  href: string;
}

interface NavGroup {
  label: string;
  links: NavLink[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Trade",
    links: [
      { title: "Assets", body: "Every tokenized stock and ETF, live premium and risk", href: "/app/assets" },
      { title: "Scanner", body: "Premium, arbitrage, risk, liquidity, new listings", href: "/app/scanner" },
      { title: "Swap & Bridge", body: "Best route across Robinhood Chain and 5 others", href: "/app/swap" },
    ],
  },
  {
    label: "Build",
    links: [
      { title: "Baskets", body: "5–10 stocks in one wallet signature", href: "/app/baskets" },
      { title: "Pools", body: "v4 RWA/USDG liquidity, volume and fee APR", href: "/app/pools" },
      { title: "Lend", body: "Kamino xStocks lending rates, read-only", href: "/app/lend" },
    ],
  },
  {
    label: "Track",
    links: [
      { title: "Portfolio", body: "Your RWA holdings in USD, cost basis and PnL", href: "/app/portfolio" },
      { title: "Alerts", body: "Premium spikes, new listings, whale trades", href: "/app/scanner" },
    ],
  },
];

/**
 * A grouped mega-menu instead of one flat link, so "Assets", "Pools",
 * "Lend" etc. read as sections of the product rather than a single
 * "workspace" destination. Click-to-toggle (not hover-only) so it works
 * the same on touch as on desktop; closes on outside click, Escape, or
 * choosing a link.
 */
export function LandingNav() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="landing-nav" ref={rootRef}>
      <button
        type="button"
        className="landing-nav-trigger"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Explore
        <span className={open ? "landing-nav-caret landing-nav-caret-open" : "landing-nav-caret"}>▾</span>
      </button>
      <Link href="/app" className="landing-cta-ghost">
        Open workspace →
      </Link>

      {open && (
        <div className="landing-nav-panel">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="landing-nav-group">
              <p className="landing-nav-group-label">{group.label}</p>
              {group.links.map((link) => (
                <Link key={link.href + link.title} href={link.href} className="landing-nav-link" onClick={() => setOpen(false)}>
                  <span className="landing-nav-link-title">{link.title}</span>
                  <span className="landing-nav-link-body">{link.body}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
