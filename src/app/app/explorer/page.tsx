import { ComingSoon } from "../coming-soon";

export const metadata = { title: "Auevo — Explorer (in progress)" };

export default function ExplorerPage() {
  return (
    <ComingSoon
      title="Explorer"
      body={
        <>
          <p>
            A log of every swap and bridge Auevo itself has sent through —
            status (pending/done/partial/refunded/failed), route, tx
            hashes (see docs/RWA_SPEC.md section 6). Backed by the
            <code> app_transfers</code> table.
          </p>
          <p>
            There is nothing to show until Phase 2 (Robinhood Chain
            swaps) and Phase 4 (LI.FI bridges) are recording trades.
          </p>
        </>
      }
    />
  );
}
