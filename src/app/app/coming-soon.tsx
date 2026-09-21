import Link from "next/link";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: "", href: "/app" },
  { id: "trading", label: "Trading", icon: "nav-trading", href: "/app/trading" },
  { id: "positions", label: "Positions", icon: "nav-position", href: "/app/positions" },
  { id: "wallets", label: "Wallets", icon: "nav-wallet", href: "/app/wallets" },
  { id: "scanner", label: "Token Scanner", icon: "nav-analytics", href: "/scanner" },
  { id: "fees", label: "Fee Scanner", icon: "nav-bots", href: "/fees" },
  { id: "otc", label: "OTC Desk", icon: "nav-copy", href: "/app/otc" },
  { id: "launch", label: "Launchpad", icon: "nav-alerts", href: "/app/launch" },
] as const;

/** Shared shell for a section that's a deliberate stop point, not a dead link. */
export function ComingSoon({
  active,
  title,
  body,
}: {
  active: string;
  title: string;
  body: ReactNode;
}) {
  return (
    <main className="app-shell">
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
              className={item.id === active ? "app-nav-link active" : "app-nav-link"}
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

      <div className="product-main app-main">
        <header className="product-header">
          <div>
            <h3>{title}</h3>
            <p>Design stage — not deployed</p>
          </div>
        </header>

        <div className="app-empty app-empty-text">{body}</div>
      </div>
    </main>
  );
}
