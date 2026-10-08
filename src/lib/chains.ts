import { defineChain } from "viem";

/**
 * Robinhood Chain — the EVM L2 Auevo is building its platform on.
 *
 * This configuration is deliberately standalone: no RPC endpoint, key or
 * contract address here is shared with any other project running on the
 * same chain. Auevo's stack is independent end to end.
 *
 * The endpoint list is env-driven so moving off the public RPC onto a
 * dedicated provider (Alchemy / QuickNode) is a deployment change, not a
 * code change. ROBINHOOD_RPC_URL accepts a comma-separated list; the
 * first entry is primary and the rest are failovers.
 */
export const ROBINHOOD_CHAIN_ID = 4663;

/** Public endpoint — fine to start on, rate limited, no SLA. */
export const ROBINHOOD_PUBLIC_RPC_URL =
  "https://rpc.mainnet.chain.robinhood.com";

export function robinhoodRpcUrls(): string[] {
  const configured = (process.env.ROBINHOOD_RPC_URL ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  return configured.length > 0 ? configured : [ROBINHOOD_PUBLIC_RPC_URL];
}

/**
 * Native currency metadata is overridable because we have not been able to
 * confirm it against the live chain yet — it is a display label only. No
 * number the token scanner reports is derived from it (the scanner reads
 * ERC-20 contracts, which carry their own decimals), so a wrong symbol
 * here can mislabel a gas figure but cannot corrupt a result.
 */
const NATIVE_SYMBOL = process.env.ROBINHOOD_NATIVE_SYMBOL?.trim() || "ETH";

export const robinhoodChain = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: {
    name: process.env.ROBINHOOD_NATIVE_NAME?.trim() || NATIVE_SYMBOL,
    symbol: NATIVE_SYMBOL,
    decimals: 18,
  },
  rpcUrls: {
    default: { http: robinhoodRpcUrls() },
  },
});
