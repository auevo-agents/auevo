import type { Address } from "viem";

export interface MorphoVault {
  name: string;
  address: Address;
  curator: string;
}

/**
 * Curated USDG ERC-4626 vaults on Morpho, live on Robinhood Chain (chain
 * 4663) — confirmed at app.morpho.org/vaults?chains=4663 (blocked from this
 * sandbox's own network egress, so every address below was verified
 * secondhand, never guessed — same posture KAMINO_XSTOCKS_MARKET_PUBKEY
 * (lib/rwa/kamino.ts) took until its own value got confirmed).
 *
 * This is a deposit-yield feature, not a stock-collateralized loan: as of
 * 2026-09-27 no market on Morpho's Robinhood Chain deployment lets you
 * borrow against an xStocks token (its variable-rate markets there are all
 * USDG loans against stablecoin/yield-token collateral — USDe, syrupUSDG,
 * mGLO, spUSDG, PONS, CASHCAT). /app/lend's Kamino section (xStocks
 * collateral, on Solana) and this Morpho section (USDG yield, on Robinhood
 * Chain) are deliberately two different features, not overlapping ones.
 */
export const MORPHO_USDG_VAULTS: MorphoVault[] = [];
