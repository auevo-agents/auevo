import { base, mainnet } from "viem/chains";
import type { Chain } from "viem";

/**
 * The two chains AUEVO Wallet reads balances on, per HANDOFF.md's MVP
 * scope: Ethereum mainnet and Base. Robinhood Chain (the RWA platform's
 * own chain — see src/lib/chains.ts) is deliberately NOT in this list yet;
 * the wallet's job right now is a general-purpose ETH/USDC wallet, not an
 * RWA trading terminal, and adding chains here is a config change, not a
 * rewrite (mirrors the pattern already used by LIFI_EVM_CHAIN_LIST).
 */
export const WALLET_CHAINS = [mainnet, base] as const satisfies readonly [Chain, ...Chain[]];

export type WalletChain = (typeof WALLET_CHAINS)[number];

/**
 * Circle's official native USDC contract addresses — not the older
 * bridged USDC.e some chains also carry. Source: circle.com/multi-chain-usdc
 * (Ethereum and Base entries), cross-checked against each chain's own
 * block explorer listing for the canonical USDC token. Hardcoded rather
 * than discovered because these are canonical, permanent deployments (not
 * per-project addresses that could be wrong the way an unverified RWA pool
 * address could be) — the same standing this app already gives USDG's
 * address to price RWA pools.
 */
export const USDC_ADDRESS: Record<number, `0x${string}`> = {
  [mainnet.id]: "0xA0b86991c6218b36c1D19D4a2e9Eb0cE3606eB48",
  [base.id]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

export const USDC_DECIMALS = 6;

export function chainById(chainId: number): WalletChain | undefined {
  return WALLET_CHAINS.find((c) => c.id === chainId);
}
