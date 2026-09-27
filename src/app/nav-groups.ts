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
