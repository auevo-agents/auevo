import type { Address } from "viem";

/**
 * Uniswap V3 periphery contracts on Robinhood Chain (chain id 4663).
 *
 * Sourced from Uniswap's own deployments manifest —
 * github.com/Uniswap/contracts/blob/main/deployments/4663.md, fetched
 * 2026-09-21 — not from a search result or a third-party mirror. That
 * distinction mattered in practice: an earlier search result labelled a
 * address as "UniversalRouter" that this file instead lists as
 * UniswapInterfaceMulticall — a completely different contract. Sending a
 * swap to the wrong address either reverts (best case) or succeeds
 * against a contract that does something else entirely (worst case). If
 * Uniswap redeploys on this chain, re-fetch that file rather than
 * patching a single address here.
 *
 * SwapRouter02 is used instead of the newer UniversalRouter deliberately:
 * it takes a plain ERC-20 `approve` + `exactInputSingle` call, which is
 * far less code to get right than Universal Router's command-encoding +
 * Permit2 signature flow. Less custom encoding here means less surface
 * for an encoding bug to move funds to the wrong place.
 */
export const UNISWAP_V3_FACTORY: Address =
  "0x1f7D7550B1B028f7571e69A784071f0205fd2eFA";
export const UNISWAP_QUOTER_V2: Address =
  "0x33e885Ed0Ec9BF04eCfB19341582AAdcb4C8a9E7";
export const UNISWAP_SWAP_ROUTER_02: Address =
  "0xcaF681A66d020601342297493863E78C959E5cB2";

/**
 * WETH9 / wrapped native ETH for Robinhood Chain mainnet — not yet
 * confirmed. The one address surfaced in research was flagged by the
 * source itself as possibly the testnet deployment, and a wrong WETH
 * address here would send a wrap or swap to a contract that either isn't
 * WETH at all or is the wrong chain's WETH.
 *
 * Left unset on purpose rather than guessed. Trading currently supports
 * ERC-20 <-> ERC-20 pairs only (see /app/trading) — no native-ETH wrap
 * step — until this is confirmed against Robinhood Chain's own docs or
 * Blockscout and set here.
 */
export const WETH9: Address | null = null;

/** Fee tiers to probe when looking for a live pool between two tokens. */
export const FEE_TIERS = [500, 3000, 10000, 100] as const;
