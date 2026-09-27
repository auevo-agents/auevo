import type { Address } from "viem";

export interface MorphoVault {
  name: string;
  address: Address;
  curator: string;
}

/**
 * Curated USDG ERC-4626 vaults on Morpho, live on Robinhood Chain (chain
 * 4663). app.morpho.org itself is blocked from this sandbox's own network
 * egress (confirmed repeatedly: direct curl, WebFetch, the public RPC,
 * both Blockscout endpoints, and Morpho's own blue-api.morpho.org GraphQL
 * API all refused the connection) — so both addresses below were
 * confirmed the same way KAMINO_XSTOCKS_MARKET_PUBKEY (lib/rwa/kamino.ts)
 * was: the user opened each vault's own page in a real browser and pasted
 * back its URL, which Morpho's own frontend encodes the vault address
 * into directly (app.morpho.org/robinhood-chain/vault/{address}/{slug}),
 * confirmed 2026-09-27. Never guessed, never taken from a single
 * AI-search-summary alone (an earlier web search surfaced the same
 * Steakhouse address as one candidate among sources that didn't fully
 * agree with each other, which is exactly why it waited for this direct
 * confirmation before being hardcoded into a feature that moves real
 * user deposits).
 *
 * This is a deposit-yield feature, not a stock-collateralized loan: as of
 * 2026-09-27 no market on Morpho's Robinhood Chain deployment lets you
 * borrow against an xStocks token (its variable-rate markets there are all
 * USDG loans against stablecoin/yield-token collateral — USDe, syrupUSDG,
 * mGLO, spUSDG, PONS, CASHCAT). /app/lend's Kamino section (xStocks
 * collateral, on Solana) and this Morpho section (USDG yield, on Robinhood
 * Chain) are deliberately two different features, not overlapping ones.
 */
export const MORPHO_USDG_VAULTS: MorphoVault[] = [
  {
    name: "Steakhouse USDG",
    address: "0xBeEff033F34C046626B8D0A041844C5d1A5409dd",
    curator: "Steakhouse Financial",
  },
  {
    name: "Purinta USDG",
    address: "0x37788ff0c1d4e45A7FE06BC7e71e0cc00121d0A8",
    curator: "Api3",
  },
];
