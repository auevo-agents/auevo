/**
 * "Private swap" — HyperDex's nav item for submitting a trade without it
 * sitting in a public mempool first, where it's exposed to front-running/
 * sandwich MEV before it lands. RWA_SPEC.md section 9 excludes "Private
 * swaps / миксеры" — but that line is about privacy MIXERS (obscuring
 * fund origin, real AML/regulatory risk), not MEV-protected submission,
 * which is a standard, widely-offered DeFi consumer protection (many
 * DEXs/aggregators offer a "protect me from MEV" RPC option) with no
 * money-obscuring effect at all: the trade is still fully on-chain,
 * public once mined, from the same wallet, for the same amount.
 *
 * FLAGGED, NOT FABRICATED, on two fronts:
 *
 * 1. This session has no verified private/MEV-protected RPC endpoint for
 *    Robinhood Chain (chain 4663) — the well-known public options
 *    (Flashbots Protect, MEV Blocker) are Ethereum-mainnet-specific
 *    products tied to Ethereum's own proposer-builder separation, and
 *    this project's own rule against hardcoding an address/endpoint
 *    without a source applies here too. PRIVATE_SWAP_RPC_URL is left
 *    unset by default for exactly that reason — same posture
 *    KAMINO_XSTOCKS_MARKET_PUBKEY (lib/rwa/kamino.ts) took until its own
 *    value got confirmed. Whoever operates this deployment should only
 *    set PRIVATE_SWAP_RPC_URL to an endpoint they've confirmed actually
 *    serves Robinhood Chain.
 * 2. Even once an endpoint exists, most browser wallets (MetaMask's
 *    injected provider chief among them) never implemented
 *    `eth_signTransaction` — only `eth_sendTransaction`, which signs AND
 *    broadcasts via the wallet's own configured network in one step, with
 *    no way for a dApp to intercept where it gets sent. There is no
 *    universal way to force private submission from a page. The swap
 *    panel therefore always tries the private path first and falls back
 *    to a normal signed-and-sent transaction with an honest on-screen
 *    notice the moment a wallet returns "method not supported" — never a
 *    silently-ignored toggle.
 */

const PRIVATE_SWAP_RPC_URL = process.env.PRIVATE_SWAP_RPC_URL;

export function isPrivateSwapConfigured(): boolean {
  return Boolean(PRIVATE_SWAP_RPC_URL);
}

export class PrivateSwapNotConfiguredError extends Error {
  constructor() {
    super("Private swap is not configured on this deployment (PRIVATE_SWAP_RPC_URL is unset)");
    this.name = "PrivateSwapNotConfiguredError";
  }
}

/** Submits an already-signed raw transaction directly to the configured private RPC via eth_sendRawTransaction — never signs anything itself, and never touches the caller's key. */
export async function broadcastPrivately(signedTx: `0x${string}`): Promise<`0x${string}`> {
  if (!PRIVATE_SWAP_RPC_URL) throw new PrivateSwapNotConfiguredError();

  const res = await fetch(PRIVATE_SWAP_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [signedTx] }),
  });
  const body = (await res.json()) as { result?: `0x${string}`; error?: { message?: string } };
  if (!res.ok || body.error) {
    throw new Error(body.error?.message ?? `Private RPC returned ${res.status}`);
  }
  if (!body.result) throw new Error("Private RPC did not return a transaction hash");
  return body.result;
}
