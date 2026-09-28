import type { NavIconKind } from "./nav-icons";

/**
 * The site's full section map — one definition shared by the /app
 * workspace's own top nav (sidebar.tsx) and the public landing page's
 * footer (site-footer.tsx), so adding or renaming a section only ever
 * happens in one place instead of drifting between two hand-kept lists.
 */

export interface NavLink {
  id: string;
  label: string;
  href: string;
  icon?: NavIconKind;
  /** Renders a small "soon" badge — a deliberate stop point (see coming-soon.tsx), not a dead link. */
  soon?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  links: NavLink[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "trade",
    label: "Trade",
    links: [
      { id: "assets", label: "Assets", href: "/app/assets", icon: "bar-chart" },
      { id: "issuers", label: "Issuers", href: "/app/issuers", icon: "building" },
      { id: "scanner", label: "Scanner", href: "/app/scanner", icon: "shield" },
      { id: "swap", label: "Swap & Bridge", href: "/app/swap", icon: "swap" },
      { id: "market", label: "Market", href: "/app/market", icon: "line-chart" },
      { id: "dex", label: "DEX", href: "/app/trading", icon: "grid" },
      { id: "private-swap", label: "Private Swap", href: "/app/private-swap", icon: "lock" },
    ],
  },
  {
    id: "build",
    label: "Build",
    links: [
      { id: "baskets", label: "Baskets", href: "/app/baskets", icon: "layers" },
      { id: "pools", label: "Pools", href: "/app/pools", icon: "droplet" },
      { id: "lend", label: "Lend", href: "/app/lend", icon: "percent" },
      { id: "bots", label: "Bots", href: "/app/bots", icon: "refresh" },
    ],
  },
  {
    id: "track",
    label: "Track",
    links: [
      { id: "portfolio", label: "Portfolio", href: "/app/portfolio", icon: "briefcase" },
      { id: "wallets", label: "Wallets", href: "/app/wallets", icon: "wallet" },
      { id: "smart-money", label: "Smart Money", href: "/app/smart-money", icon: "trending-up" },
      { id: "explorer", label: "Explorer", href: "/app/explorer", icon: "search" },
    ],
  },
  {
    id: "more",
    label: "More",
    links: [
      { id: "auevo-token", label: "$AUEVO", href: "/token", icon: "coin" },
      { id: "token-scanner", label: "Token Scanner", href: "/scanner", icon: "shield" },
      { id: "fee-scanner", label: "Fee Scanner (legacy)", href: "/legacy/fees", icon: "document" },
      { id: "docs", label: "Docs", href: "/docs", icon: "book" },
    ],
  },
];
