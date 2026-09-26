import { ComingSoon } from "../coming-soon";

export const metadata = { title: "Auevo — Pools (in progress)" };

export default function RwaPoolsPage() {
  return (
    <ComingSoon
      title="Pools"
      body={
        <>
          <p>
            Liquidity pools for tokenized RWA tokens against USDG — TVL,
            24h volume, fee APR (see docs/RWA_SPEC.md section 8). Not the
            same list as <code>DEX → Pools</code>, which is the general
            Robinhood Chain pool browser; this one is scoped to the RWA
            token registry once it exists.
          </p>
          <p>Built in Phase 8, once v4 pools are indexed (Phase 6).</p>
        </>
      }
    />
  );
}
