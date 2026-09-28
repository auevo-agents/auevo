import Link from "next/link";
import type { Metadata } from "next";
import { AuevoLogo } from "@/app/auevo-logo";

/**
 * $AUEVO's own public page — separate metadata for the same reason
 * scanner/layout.tsx has its own: a link to this shared before launch
 * shouldn't unfurl as the platform's generic homepage copy.
 *
 * Deliberately no tokenomics/utility copy yet: the contract hasn't
 * deployed, and this app doesn't publish financial claims it can't back
 * with a real, verified address. Real numbers replace the placeholders
 * below the moment the token launches — see docs/RWA_SPEC.md section 9's
 * standing "no hardcoding without a verified source" rule, which applies
 * here as much as to any on-chain address this app shows.
 */
export const metadata: Metadata = {
  title: "$AUEVO — the Auevo token",
  description: "The native token of the Auevo platform, launching on Robinhood Chain.",
  openGraph: {
    title: "$AUEVO — the Auevo token",
    description: "The native token of the Auevo platform, launching on Robinhood Chain.",
    url: "https://auevo.io/token",
    siteName: "Auevo",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "$AUEVO — the Auevo token",
    description: "The native token of the Auevo platform, launching on Robinhood Chain.",
  },
};

// Fixed at 1,000,000,000 — told directly by the token's own team, not an
// on-chain read, so it needs no explorer-link verification the way an
// address does (see the contract note below).
const TOTAL_SUPPLY = 1_000_000_000;

const STATS: { label: string; value: string }[] = [
  { label: "Price", value: "—" },
  { label: "Market cap", value: "—" },
  { label: "Total supply", value: TOTAL_SUPPLY.toLocaleString("en-US") },
  { label: "Contract", value: "—" },
];

export default function TokenPage() {
  return (
    <main className="site token-page">
      <header className="topbar">
        <Link href="/" className="brand brand-auevo" aria-label="Auevo home">
          <AuevoLogo />
        </Link>

        <nav>
          <span className="trade-nav-active">$AUEVO</span>
          <Link href="/app">Auevo app →</Link>
        </nav>

        <div className="topbar-right">
          <span className="network-dot" />
          <span>Robinhood Chain</span>
        </div>
      </header>

      <section className="token-hero">
        <img src="/logos/auevo.png" alt="AUEVO" className="token-hero-mark" />
        <h1>$AUEVO</h1>
        <span className="token-hero-badge">Launching soon</span>
        <p className="token-hero-lead">
          The native token of the Auevo platform, on Robinhood Chain. The
          contract address, live price and a full read-only security
          self-scan land here the moment it deploys.
        </p>
      </section>

      <section className="token-stats" aria-label="Token stats (some unavailable until launch)">
        {STATS.map((stat) => (
          <div className="token-stat" key={stat.label}>
            <span className="token-stat-label">{stat.label}</span>
            <span className="token-stat-value">{stat.value}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
