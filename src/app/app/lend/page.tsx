import { ComingSoon } from "../coming-soon";

export const metadata = { title: "Auevo — Lend (in progress)" };

export default function LendPage() {
  return (
    <ComingSoon
      title="Lend"
      body={
        <>
          <p>
            A read-only view of lending rates for tokenized RWAs — Kamino&apos;s
            xStocks markets to start, plus any Robinhood Chain lending
            market if one shows up (see docs/RWA_SPEC.md section 8).
            Deposits are explicitly out of scope for now: we don&apos;t run our
            own lending contracts.
          </p>
          <p>Built in Phase 8.</p>
        </>
      }
    />
  );
}
