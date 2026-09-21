import { ComingSoon } from "../coming-soon";

export const metadata = { title: "Auevo — Launchpad (in progress)" };

export default function LaunchpadPage() {
  return (
    <ComingSoon
      active="launch"
      title="Launchpad"
      body={
        <>
          <p>
            A launchpad means custom deployer, vesting and sale contracts
            — again, our own Solidity holding real value, not an existing
            audited primitive to integrate with the way Trading does.
          </p>
          <p>
            Same note as OTC Desk: worth designing properly and reviewing
            before real value sits in it, rather than writing it in the
            same pass as the read-only pages and the Uniswap integration.
          </p>
        </>
      }
    />
  );
}
