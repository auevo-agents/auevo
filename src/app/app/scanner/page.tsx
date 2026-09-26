import { ComingSoon } from "../coming-soon";

export const metadata = { title: "Auevo — Scanner (in progress)" };

export default function RwaScannerPage() {
  return (
    <ComingSoon
      title="Scanner"
      body={
        <>
          <p>
            Auevo&apos;s edge over a plain RWA marketplace — Premium,
            Arbitrage, Risk, Liquidity, New Listings and Smart Money tabs
            for tokenized real-world assets specifically (see
            docs/RWA_SPEC.md sections 6 and 7). Not to be confused with the
            standalone <code>/scanner</code> EVM contract scanner, which
            this reuses for the Risk tab.
          </p>
          <p>
            Needs live premium/liquidity/risk data from Phases 1 and 5
            before any of the tabs mean anything.
          </p>
        </>
      }
    />
  );
}
