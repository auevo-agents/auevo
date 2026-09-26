import { arbitrum, base, bsc, hyperEvm, mainnet } from "wagmi/chains";
import type { Chain } from "viem";
import { robinhoodChain } from "@/lib/chains";

/**
 * RWA_SPEC.md Phase 4's EVM chain list: "Ethereum, Base, BNB, Arbitrum,
 * HyperEVM + Robinhood Chain" — Solana is explicitly deferred to the end
 * of the phase per the spec's own note, so it is not in this list.
 *
 * Chain ids are taken from `wagmi/chains` (mainnet=1, base=8453, bsc=56,
 * arbitrum=42161, hyperEvm=999 — read directly from those bundled chain
 * objects, not retyped by hand) and cross-checked against `@lifi/types`'
 * own `ChainId` enum (ETH=1, BSC=56, ARB=42161, BAS=8453, HYP=999), which
 * is the officially published source of truth for which numeric ids LI.FI
 * itself calls each chain — both agree exactly.
 *
 * Robinhood Chain's id (4663) also appears in `@lifi/types`' `ChainId`
 * enum under the short code `OUT` — real evidence LI.FI has *integrated*
 * this chain at the type level. This session cannot confirm it is *live*
 * on LI.FI's production routing (li.quest itself is blocked from this
 * sandbox, so `/v1/chains` was never actually called) — the UI and API
 * routes below treat "LI.FI returns zero routes for this chain" as an
 * ordinary empty-result case rather than assuming either way.
 */
/** Tuple form for wagmi's `createConfig({ chains })`, which requires a non-empty tuple type. */
export const LIFI_EVM_CHAIN_LIST = [mainnet, base, bsc, arbitrum, hyperEvm, robinhoodChain] as const satisfies readonly [
  Chain,
  ...Chain[],
];

export const LIFI_EVM_CHAINS: { chain: Chain; lifiChainId: number }[] = LIFI_EVM_CHAIN_LIST.map((chain) => ({
  chain,
  lifiChainId: chain.id,
}));

export function chainNameFor(chainId: number): string {
  return LIFI_EVM_CHAINS.find((c) => c.chain.id === chainId)?.chain.name ?? `Chain ${chainId}`;
}

export function isSupportedLifiChain(chainId: number): boolean {
  return LIFI_EVM_CHAINS.some((c) => c.chain.id === chainId);
}

/**
 * A block explorer's tx-detail link. Robinhood Chain's own explorer isn't
 * bundled in the chain definition (src/lib/chains.ts) the way the other
 * five chains' are — `robinhoodchain.blockscout.com` is the same host this
 * app's own token-security scanner already reads from (src/lib/evm/
 * blockscout.ts's default base URL list), not a new, unverified source.
 */
export function explorerTxUrl(chainId: number, txHash: string): string | null {
  if (chainId === robinhoodChain.id) return `https://robinhoodchain.blockscout.com/tx/${txHash}`;
  const explorerUrl = LIFI_EVM_CHAINS.find((c) => c.chain.id === chainId)?.chain.blockExplorers?.default.url;
  return explorerUrl ? `${explorerUrl}/tx/${txHash}` : null;
}
