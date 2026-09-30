import { base, mainnet } from "viem/chains";
import type { Chain } from "viem";
import { robinhoodChain } from "@/lib/chains";

/**
 * The chains AUEVO Wallet reads balances on: Ethereum, Base, and Robinhood
 * Chain (the RWA platform's own chain — see src/lib/chains.ts), so a user
 * on Robinhood Chain can send/receive/swap the same native gas token they
 * already hold there. USDC has no confirmed deployment on Robinhood Chain
 * (see the comment on USDC_ADDRESS below) — chainById callers that key off
 * USDC_ADDRESS already treat a missing entry as "not available here"
 * rather than guessing, so this chain just shows up as ETH-only for now.
 */
export const WALLET_CHAINS = [mainnet, base, robinhoodChain] as const satisfies readonly [Chain, ...Chain[]];

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
 *
 * Robinhood Chain deliberately has no entry here: its own stable asset is
 * USDG (src/lib/rwa/dex/addresses.ts), a different token than USDC, and
 * this wallet's "USDC" asset slot is specifically USDC — not a generic
 * "whatever stablecoin this chain uses" slot. Every read keys off this map
 * and already treats a missing chain as "no USDC asset here" rather than
 * falling back to a different token under the same label.
 */
export const USDC_ADDRESS: Record<number, `0x${string}`> = {
  [mainnet.id]: "0xA0b86991c6218b36c1D19D4a2e9Eb0cE3606eB48",
  [base.id]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

export const USDC_DECIMALS = 6;

export function chainById(chainId: number): WalletChain | undefined {
  return WALLET_CHAINS.find((c) => c.id === chainId);
}
