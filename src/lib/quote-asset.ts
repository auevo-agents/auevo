/**
 * A recognized "quote leg" for USD-denominated PnL/position math
 * (wallet-pnl.ts, wallet-positions.ts, indexed-smart-money.ts) — RWA_SPEC.md
 * Phase 6's "Generalize the quote leg: WETH → any of {USDG, USDC, WETH}".
 *
 * `usdPrice` is resolved ahead of time by the caller (see
 * rwa/quote-assets.ts for Robinhood Chain's actual resolver) — these
 * functions never fetch a price themselves, so they stay pure and
 * testable with no network involved. USDC is deliberately not resolved
 * anywhere yet: this project has no confirmed USDC address on Robinhood
 * Chain (unlike USDG/WETH9, both already verified elsewhere in this
 * codebase), and inventing one would violate this project's own standing
 * rule against unverified contract addresses.
 */
export interface QuoteAssetPrice {
  address: string;
  decimals: number;
  usdPrice: number;
}
