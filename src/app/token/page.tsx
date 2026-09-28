import Link from "next/link";
import type { Metadata } from "next";
import { AuevoLogo } from "@/app/auevo-logo";
import { CopyableAddress } from "@/app/copyable-address";
import { fetchDexscreenerToken } from "@/lib/dexscreener";
import { formatPrice, formatUsdCompact } from "@/lib/format";

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

// Set to the real deployed address once the user gives it — the same way
// every other on-chain address in this app gets confirmed (they paste a
// real explorer URL), never a guess. Until then this whole page just
// shows honest placeholders; nothing below depends on this being wrong.
const AUEVO_CONTRACT: `0x${string}` | null = null;

const EXPLORER_BASE = "https://robinhoodchain.blockscout.com";

export default async function TokenPage() {
  // DexScreener indexes by address across every chain it covers — no
  // Robinhood-Chain-specific slug to get right or wrong here (unlike
  // gecko-price.ts's NETWORK_SLUGS), so this is safe to wire up now and
  // just starts returning real numbers once a pool exists.
  const market = AUEVO_CONTRACT ? await fetchDexscreenerToken(AUEVO_CONTRACT) : null;

  const stats: { label: string; value: string }[] = [
    { label: "Price", value: formatPrice(market?.priceUsd ?? null) },
    { label: "Market cap", value: formatUsdCompact(market?.marketCapUsd ?? null) },
    { label: "Total supply", value: TOTAL_SUPPLY.toLocaleString("en-US") },
    { label: "Contract", value: "—" },
  ];

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
        {stats.map((stat) => (
          <div className="token-stat" key={stat.label}>
            <span className="token-stat-label">{stat.label}</span>
            {stat.label === "Contract" && AUEVO_CONTRACT ? (
              <span className="token-stat-value">
                <CopyableAddress address={AUEVO_CONTRACT} />
              </span>
            ) : (
              <span className="token-stat-value">{stat.value}</span>
            )}
          </div>
        ))}
      </section>

      {AUEVO_CONTRACT && (
        <section className="token-links">
          <a href={`${EXPLORER_BASE}/address/${AUEVO_CONTRACT}`} target="_blank" rel="noreferrer">
            View on explorer →
          </a>
          {market?.pairUrl && (
            <a href={market.pairUrl} target="_blank" rel="noreferrer">
              View on DexScreener →
            </a>
          )}
        </section>
      )}
    </main>
  );
}
