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
  icon: string;
  href: string;
}[] = [
  { id: "overview", label: "Overview", icon: "", href: "/app" },
  { id: "market", label: "Market", icon: "nav-bots", href: "/app/market" },
  {
    id: "smart-money",
    label: "Smart Money",
    icon: "nav-money",
    href: "/app/smart-money",
  },
  {
    id: "trading",
    label: "Trading",
    icon: "nav-trading",
    href: "/app/trading",
  },
  { id: "bots", label: "Bots", icon: "nav-copy", href: "/app/bots" },
  {
    id: "positions",
    label: "Positions",
    icon: "nav-position",
    href: "/app/positions",
  },
  { id: "wallets", label: "Wallets", icon: "nav-wallet", href: "/app/wallets" },
  {
    id: "scanner",
    label: "Token Scanner",
    icon: "nav-analytics",
    href: "/scanner",
  },
  { id: "fees", label: "Fee Scanner", icon: "nav-bots", href: "/fees" },
  { id: "otc", label: "OTC Desk", icon: "nav-copy", href: "/app/otc" },
  { id: "launch", label: "Launchpad", icon: "nav-alerts", href: "/app/launch" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="product-sidebar">
      <div className="product-logo">
        <strong>auevo</strong>
        <i />
      </div>

      <nav className="product-nav">
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
            <span className={`nav-icon ${item.icon}`}>
              <i />
              <i />
              <i />
              <i />
            </span>
            <b>{item.label}</b>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
