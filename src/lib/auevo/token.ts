/**
 * $AUEVO's own on-chain address — shared between src/app/token/page.tsx
 * and the homepage (the prominent "official contract" banner), so it's
 * defined once instead of duplicated or imported across route modules.
 *
 * Verified on-chain before this was ever set (not taken on trust from
 * the address alone): name() = "Auevo", symbol() = "AUEVO",
 * decimals() = 18, totalSupply() = exactly 1,000,000,000 * 1e18 — see
 * contracts/DEPLOYMENTS_PENDING.md's Deployed table for the same checks.
 * Launched via Pons on Robinhood Chain, paired against USDG.
 */
export const AUEVO_CONTRACT: `0x${string}` = "0x40ceA1a452E2aDD3125BAbA3f9ffDa4a1B593EB8";

export const AUEVO_TOTAL_SUPPLY = 1_000_000_000;
