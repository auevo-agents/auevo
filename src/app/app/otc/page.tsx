import Link from "next/link";
import { ComingSoon } from "../coming-soon";

export const metadata = { title: "Auevo — OTC Desk (in progress)" };

export default function OtcDeskPage() {
  return (
    <ComingSoon
      active="otc"
      title="OTC Desk"
      body={
        <>
          <p>
            An OTC desk means an escrow contract holding both sides of a
            trade until it settles — custom Solidity, not an existing,
            already-audited primitive the way <Link href="/app/trading">Trading</Link> routes
            through Uniswap&apos;s own SwapRouter02.
          </p>
          <p>
            That is a different kind of work: designing the escrow logic,
            then having it reviewed, before it goes anywhere near mainnet
            money — even money that is only yours for now. Ready to start
            on the design when you are; flagging it here rather than
            shipping unreviewed escrow code straight to mainnet in the
            same pass as everything else.
          </p>
        </>
      }
    />
  );
}
