import { ComingSoon } from "../coming-soon";

export const metadata = { title: "Auevo — Assets (in progress)" };

export default function AssetsPage() {
  return (
    <ComingSoon
      title="Assets"
      body={
        <>
          <p>
            The RWA catalog — every tokenized stock, ETF, commodity,
            treasury and private-credit token we can find, across issuers
            and chains, with a per-row premium/discount to the real asset,
            risk score and liquidity depth (see docs/RWA_SPEC.md sections
            5–6).
          </p>
          <p>
            Needs the token registry and reference pricing built first
            (Phase 1) before there is anything real to list here.
          </p>
        </>
      }
    />
  );
}
