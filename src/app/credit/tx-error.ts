/**
 * wagmi/viem write errors carry a `.message` that dumps the entire request
 * (chain, args, calldata, a docs link, the raw wallet RPC error) — useful in
 * a terminal, unreadable as on-page copy (e.g. a plain "I clicked reject in
 * MetaMask" shows up as several lines of hex and a viem.sh link). viem's own
 * `.shortMessage` is the human-readable first line of the same error (e.g.
 * "User rejected the request.") — prefer it everywhere a tx error reaches
 * the page.
 */
export function txErrorMessage(error: { shortMessage?: string; message: string } | null | undefined): string | null {
  if (!error) return null;
  return error.shortMessage || error.message;
}
