import type { Metadata } from "next";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { AuevoMark } from "@/app/auevo-logo";
import { CopyableAddress } from "@/app/copyable-address";
import { fetchDexscreenerToken } from "@/lib/dexscreener";
import { formatPrice, formatUsdCompact } from "@/lib/format";
import { AUEVO_CONTRACT, AUEVO_TOTAL_SUPPLY } from "@/lib/auevo/token";

/**
 * $AUEVO's own public page — separate metadata for the same reason
 * scanner/layout.tsx has its own: a link to this shared before launch
 * shouldn't unfurl as the platform's generic homepage copy.
 *
 * Deliberately no tokenomics/utility copy: this app doesn't publish
 * financial claims it can't back with real, verified data. Price/market
 * cap below are DexScreener reads (real once a pool is indexed, "—"
 * until then, never guessed) — see docs/RWA_SPEC.md section 9's standing
 * "no hardcoding without a verified source" rule, which applies here as
 * much as to any other on-chain address this app shows.
 */
export const metadata: Metadata = {
  title: "$AUEVO — the Auevo token",
  description: "The native token of the Auevo platform, live on Robinhood Chain.",
  openGraph: {
    title: "$AUEVO — the Auevo token",
    description: "The native token of the Auevo platform, live on Robinhood Chain.",
    url: "https://auevo.io/token",
    siteName: "Auevo",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "$AUEVO — the Auevo token",
    description: "The native token of the Auevo platform, live on Robinhood Chain.",
  },
};

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
    { label: "Total supply", value: AUEVO_TOTAL_SUPPLY.toLocaleString("en-US") },
    { label: "Contract", value: "—" },
  ];

  return (
    <main className="site token-page">
      <AgentPortalHeader />

      <section className="token-hero">
        <AuevoMark className="token-hero-mark" title="AUEVO tree logo" />
        <h1>$AUEVO</h1>
        <span className="token-hero-badge">Live on Robinhood Chain</span>
        <p className="token-hero-lead">
          The native token of the Auevo platform, launched on Robinhood
          Chain via Pons — fixed supply, liquidity locked from block one,
          no admin key on the token contract.
        </p>
      </section>

      <section className="token-stats" aria-label="Token stats (unavailable before launch)">
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
