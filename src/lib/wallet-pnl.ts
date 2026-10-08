import { formatUnits } from "viem";
import type { QuoteAssetPrice } from "./quote-asset";

/**
 * A single wallet's realized PnL, denominated in ETH rather than USD —
 * more accurate than the aggregate Smart Money leaderboard's USD volume
 * figures (see smart-money.ts), because almost every pool on this chain
 * is quoted against WETH9: instead of approximating cost basis from a
 * volume field, this reads the exact WETH amount paid or received on
 * each swap straight from the Swap event. Same honest limitation as
 * everywhere else this session: only "closed" positions (both a buy and
 * a sell of the same token visible in this wallet's indexed window)
 * count toward realized PnL and win rate — a token only ever bought or
 * only ever sold counts as neither.
 */

const WETH_DECIMALS = 18;

export interface WalletSwapInput {
  amount0: string;
  amount1: string;
  token0: string;
  token1: string;
}

export interface WalletPnlSummary {
  realizedPnlEth: number;
  wins: number;
  losses: number;
  tokensTraded: number;
}

export function computeWalletPnl(swaps: WalletSwapInput[], wethAddress: string): WalletPnlSummary {
  const weth = wethAddress.toLowerCase();
  const perToken = new Map<string, { buyEth: number; sellEth: number }>();

  for (const s of swaps) {
    const token0 = s.token0.toLowerCase();
    const token1 = s.token1.toLowerCase();
    const wethIsToken0 = token0 === weth;
    const wethIsToken1 = token1 === weth;
    if (wethIsToken0 === wethIsToken1) continue; // neither leg is WETH (or, degenerately, both) — no ETH cost basis to price this against

    const baseToken = wethIsToken0 ? token1 : token0;
    const amount0 = BigInt(s.amount0);
    const amount1 = BigInt(s.amount1);
    const wethAmount = wethIsToken0 ? amount0 : amount1;
    // Pool's perspective: positive base amount = wallet paid it (sold);
    // negative = wallet received it (bought). Same convention used for
    // the activity feed's paid/received legs.
    const baseAmount = wethIsToken0 ? amount1 : amount0;

    const wethFloat = Math.abs(Number(formatUnits(wethAmount, WETH_DECIMALS)));
    const entry = perToken.get(baseToken) ?? { buyEth: 0, sellEth: 0 };
    if (baseAmount < 0n) entry.buyEth += wethFloat;
    else if (baseAmount > 0n) entry.sellEth += wethFloat;
    perToken.set(baseToken, entry);
  }

  let realizedPnlEth = 0;
  let wins = 0;
  let losses = 0;
  for (const { buyEth, sellEth } of perToken.values()) {
    if (buyEth > 0 && sellEth > 0) {
      const pnl = sellEth - buyEth;
      realizedPnlEth += pnl;
      if (pnl > 0) wins += 1;
      else losses += 1;
    }
  }

  return { realizedPnlEth, wins, losses, tokensTraded: perToken.size };
}

/**
 * RWA_SPEC.md Phase 6's generalization: `computeWalletPnl` above stays
 * exactly as it was (still what the memecoin-era wallet profile/Smart
 * Money pages read, ETH-only, untouched so their existing tests keep
 * passing) — this is a new, separate function for the USD/multi-quote-
 * asset case Portfolio and the RWA Smart Money leaderboard need. Same
 * cost-basis logic, generalized over any number of recognized quote
 * assets (see quote-asset.ts) instead of a single hardcoded WETH address,
 * and priced in USD via each asset's own resolved usdPrice instead of raw
 * ETH units.
 */
export interface WalletPnlSummaryUsd {
  realizedPnlUsd: number;
  wins: number;
  losses: number;
  tokensTraded: number;
}

export function computeWalletPnlUsd(swaps: WalletSwapInput[], quoteAssets: QuoteAssetPrice[]): WalletPnlSummaryUsd {
  const quoteByAddress = new Map(quoteAssets.map((q) => [q.address.toLowerCase(), q]));
  const perToken = new Map<string, { buyUsd: number; sellUsd: number }>();

  for (const s of swaps) {
    const token0 = s.token0.toLowerCase();
    const token1 = s.token1.toLowerCase();
    const quote0 = quoteByAddress.get(token0);
    const quote1 = quoteByAddress.get(token1);
    if (Boolean(quote0) === Boolean(quote1)) continue; // neither leg is a recognized quote asset, or (degenerately) both are — no USD cost basis either way

    const quote = quote0 ?? quote1!;
    const baseToken = quote0 ? token1 : token0;
    const amount0 = BigInt(s.amount0);
    const amount1 = BigInt(s.amount1);
    const quoteAmount = quote0 ? amount0 : amount1;
    // Pool's perspective: positive base amount = wallet paid it (sold); negative = wallet received it (bought).
    const baseAmount = quote0 ? amount1 : amount0;

    const quoteUsd = Math.abs(Number(formatUnits(quoteAmount, quote.decimals))) * quote.usdPrice;
    const entry = perToken.get(baseToken) ?? { buyUsd: 0, sellUsd: 0 };
    if (baseAmount < 0n) entry.buyUsd += quoteUsd;
    else if (baseAmount > 0n) entry.sellUsd += quoteUsd;
    perToken.set(baseToken, entry);
  }

  let realizedPnlUsd = 0;
  let wins = 0;
  let losses = 0;
  for (const { buyUsd, sellUsd } of perToken.values()) {
    if (buyUsd > 0 && sellUsd > 0) {
      const pnl = sellUsd - buyUsd;
      realizedPnlUsd += pnl;
      if (pnl > 0) wins += 1;
      else losses += 1;
    }
  }

  return { realizedPnlUsd, wins, losses, tokensTraded: perToken.size };
}
