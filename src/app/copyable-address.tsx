import { CopyButton } from "./copy-button";
import { shortenAddress } from "@/lib/format";

/**
 * A shortened address/hash plus a copy button — the pairing this app was
 * missing everywhere an address was only ever shown truncated (see
 * CopyButton's own doc comment). Not a client component itself (no hooks
 * of its own), so it drops straight into server-rendered rows too; only
 * the nested CopyButton needs the client boundary.
 */
export function CopyableAddress({
  address,
  head = 6,
  tail = 4,
  mono = true,
  className,
}: {
  address: string;
  head?: number;
  tail?: number;
  mono?: boolean;
  className?: string;
}) {
  return (
    <span className={`copyable-address${className ? ` ${className}` : ""}`} title={address}>
      <span className={mono ? "scan-mono" : undefined}>{shortenAddress(address, head, tail)}</span>
      <CopyButton value={address} />
    </span>
  );
}
