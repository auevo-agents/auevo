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
  "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA";
export const UNISWAP_QUOTER_V2: Address =
  "0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7";
export const UNISWAP_SWAP_ROUTER_02: Address =
  "0xCaf681a66D020601342297493863E78C959E5cb2";

/**
 * WETH9 / wrapped native ETH for Robinhood Chain mainnet.
 *
 * Confirmed 2026-09-21 against two independent official Uniswap sources
 * that agree exactly: github.com/Uniswap/contracts's own deployments
 * manifest (deployments/4663.md — the same file the addresses above came
 * from) and github.com/Uniswap/UniswapX's chain playbook
 * (playbook/chains/robinhood.md). This had been left unset for most of
 * this project rather than guessed — the one earlier candidate was
 * flagged by its own source as possibly testnet-only — until both of
 * these confirmed it independently.
 */
export const WETH9: Address = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";

/** Fee tiers to probe when looking for a live pool between two tokens. */
export const FEE_TIERS = [500, 3000, 10000, 100] as const;
