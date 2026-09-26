import { ComingSoon } from "../coming-soon";

export const metadata = { title: "Auevo — Issuers (in progress)" };

export default function IssuersPage() {
  return (
    <ComingSoon
      title="Issuers"
      body={
        <>
          <p>
            The RWA issuers behind the tokens on Assets — Ondo, xStocks,
            Robinhood, Coinbase, bStocks and the rest, with what each one
            backs and how (see docs/RWA_SPEC.md section 2).
          </p>
          <p>Built alongside the Assets catalog in Phase 3.</p>
        </>
      }
    />
  );
}
