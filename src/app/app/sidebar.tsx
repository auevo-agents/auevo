"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The one nav-item list for the whole /app workspace. Every page used to
 * define its own copy of this array and its own <aside> markup — nothing
 * kept them in sync, so pages drifted to showing different subsets of
 * links (e.g. Market/Bots/Positions/Wallets were all missing the last
 * four items). Rendered once from the shared layout instead, so there is
 * only one list to ever update.
 */
export const NAV_ITEMS: {
  id: string;
  label: string;
  href: string;
}[] = [
  { id: "overview", label: "Overview", href: "/app" },
  { id: "market", label: "Market", href: "/app/market" },
  { id: "smart-money", label: "Smart Money", href: "/app/smart-money" },
  { id: "trading", label: "Trading", href: "/app/trading" },
  { id: "bots", label: "Bots", href: "/app/bots" },
  { id: "positions", label: "Positions", href: "/app/positions" },
  { id: "wallets", label: "Wallets", href: "/app/wallets" },
  { id: "scanner", label: "Token Scanner", href: "/scanner" },
  { id: "fees", label: "Fee Scanner", href: "/fees" },
  { id: "otc", label: "OTC Desk", href: "/app/otc" },
  { id: "launch", label: "Launchpad", href: "/app/launch" },
];

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
          </Link>
        ))}
      </nav>
    </header>
  );
}
