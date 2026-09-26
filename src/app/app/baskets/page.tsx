import { ComingSoon } from "../coming-soon";

export const metadata = { title: "Auevo — Baskets (in progress)" };

export default function BasketsPage() {
  return (
    <ComingSoon
      title="Baskets"
      body={
        <>
          <p>
            Weighted baskets of tokenized stocks bought in one transaction
            (Strategy baskets — our own improvement over the N-signature
            flow other RWA marketplaces use), plus Index baskets tracking
            an on-chain index fund&apos;s actual holdings. See
            docs/RWA_SPEC.md section 7.
          </p>
          <p>Needs the Uniswap v4 swap path from Phase 2 to build on.</p>
        </>
      }
    />
  );
}
