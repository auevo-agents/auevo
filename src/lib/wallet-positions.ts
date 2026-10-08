import { formatUnits } from "viem";
import { basePriceInWeth } from "./uniswap-price";
import type { QuoteAssetPrice } from "./quote-asset";

/**
 * Open positions, not just a raw activity feed — what Axiom's Portfolio
 * and GMGN's holdings view both center on: a current balance, its
 * average cost (from this wallet's own buys), a live mark price, and
 * the unrealized PnL between them. Cost basis uses simple average cost
 * (total ETH paid across all buys / total units bought), the same
 * simplification GMGN's own docs describe ("cost basis of the current
 * open position"), not FIFO lot tracking — a wallet that moved tokens
 * in from outside this indexed window will show a skewed cost basis,
 * same honest limitation as the rest of this page.
 */

const WETH_DECIMALS = 18;

export interface PositionSwapInput {
  amount0: string;
  amount1: string;
  token0: string;
  token1: string;
  tick: number;
  blockNumber: number;
}

export interface TokenPosition {
  token: string;
  buyUnits: number;
  sellUnits: number;
  buyEth: number;
  sellEth: number;
  wethIsToken0: boolean;
  decimals0: number;
  decimals1: number;
  latestTick: number;
  latestBlock: number;
}

export function aggregatePositions(
  swaps: PositionSwapInput[],
  wethAddress: string,
  decimalsOf: (token: string) => number
): Map<string, TokenPosition> {
  const weth = wethAddress.toLowerCase();
  const byToken = new Map<string, TokenPosition>();

  for (const s of swaps) {
    const token0 = s.token0.toLowerCase();
    const token1 = s.token1.toLowerCase();
    const wethIsToken0 = token0 === weth;
    const wethIsToken1 = token1 === weth;
    if (wethIsToken0 === wethIsToken1) continue; // neither or both — no ETH-denominated price for this swap

    const baseToken = wethIsToken0 ? token1 : token0;
    const decimals0 = decimalsOf(token0);
    const decimals1 = decimalsOf(token1);
    const baseDecimals = wethIsToken0 ? decimals1 : decimals0;

    const amount0 = BigInt(s.amount0);
    const amount1 = BigInt(s.amount1);
    const wethAmount = wethIsToken0 ? amount0 : amount1;
    // Pool's perspective: negative base amount = wallet received it (bought); positive = wallet paid it (sold).
    const baseAmount = wethIsToken0 ? amount1 : amount0;

    const wethFloat = Math.abs(Number(formatUnits(wethAmount, WETH_DECIMALS)));
    const baseFloat = Math.abs(Number(formatUnits(baseAmount, baseDecimals)));

    const entry = byToken.get(baseToken) ?? {
      token: baseToken,
      buyUnits: 0,
      sellUnits: 0,
      buyEth: 0,
      sellEth: 0,
      wethIsToken0,
      decimals0,
      decimals1,
      latestTick: s.tick,
      latestBlock: s.blockNumber,
    };

    if (baseAmount < 0n) {
      entry.buyUnits += baseFloat;
      entry.buyEth += wethFloat;
    } else if (baseAmount > 0n) {
      entry.sellUnits += baseFloat;
      entry.sellEth += wethFloat;
    }

    if (s.blockNumber >= entry.latestBlock) {
      entry.latestTick = s.tick;
      entry.latestBlock = s.blockNumber;
      entry.wethIsToken0 = wethIsToken0;
      entry.decimals0 = decimals0;
      entry.decimals1 = decimals1;
    }

    byToken.set(baseToken, entry);
  }

  return byToken;
}

export interface PositionView {
  token: string;
  balance: number;
  avgCostWeth: number | null;
  currentPriceWeth: number;
  costBasisWeth: number | null;
  currentValueWeth: number;
  unrealizedPnlWeth: number | null;
  realizedPnlWeth: number | null;
}

/** Combines an aggregated buy/sell history with a live on-chain balance into a displayable position. */
export function evaluatePosition(pos: TokenPosition, balanceHuman: number): PositionView {
  const currentPriceWeth = basePriceInWeth(pos.latestTick, pos.wethIsToken0, pos.decimals0, pos.decimals1);
  const avgCostWeth = pos.buyUnits > 0 ? pos.buyEth / pos.buyUnits : null;
  const costBasisWeth = avgCostWeth !== null ? avgCostWeth * balanceHuman : null;
  const currentValueWeth = balanceHuman * currentPriceWeth;
  const unrealizedPnlWeth = costBasisWeth !== null ? currentValueWeth - costBasisWeth : null;
  const realizedPnlWeth = pos.buyEth > 0 && pos.sellEth > 0 ? pos.sellEth - pos.buyEth : null;

  return {
    token: pos.token,
    balance: balanceHuman,
    avgCostWeth,
    currentPriceWeth,
    costBasisWeth,
    currentValueWeth,
    unrealizedPnlWeth,
    realizedPnlWeth,
  };
}

/**
 * RWA_SPEC.md Phase 6's generalization — `aggregatePositions`/
 * `evaluatePosition` above are untouched (still WETH-only, still what the
 * existing wallet profile page reads, so their tests keep passing). This
 * is the USD/multi-quote-asset sibling Portfolio and the RWA leaderboard
 * need: same cost-basis and mark-price math, generalized over any
 * recognized quote asset (quote-asset.ts) and priced in USD instead of ETH.
 *
 * Reuses `basePriceInWeth`'s tick math as-is rather than a renamed copy —
 * despite its name, the function only ever computes "price of the other
 * leg in whichever asset sits on the WETH side of the ratio," which is
 * exactly as true for USDG or any other quote asset as it is for WETH.
 */
export interface TokenPositionUsd {
  token: string;
  buyUnits: number;
  sellUnits: number;
  buyUsd: number;
  sellUsd: number;
  quoteIsToken0: boolean;
  quoteDecimals: number;
  quoteUsdPrice: number;
  decimals0: number;
  decimals1: number;
  latestTick: number;
  latestBlock: number;
}

export function aggregatePositionsUsd(
  swaps: PositionSwapInput[],
  quoteAssets: QuoteAssetPrice[],
  decimalsOf: (token: string) => number
): Map<string, TokenPositionUsd> {
  const quoteByAddress = new Map(quoteAssets.map((q) => [q.address.toLowerCase(), q]));
  const byToken = new Map<string, TokenPositionUsd>();

  for (const s of swaps) {
    const token0 = s.token0.toLowerCase();
    const token1 = s.token1.toLowerCase();
    const quote0 = quoteByAddress.get(token0);
    const quote1 = quoteByAddress.get(token1);
    if (Boolean(quote0) === Boolean(quote1)) continue; // neither or both — no USD-denominated price for this swap

    const quote = quote0 ?? quote1!;
    const quoteIsToken0 = Boolean(quote0);
    const baseToken = quoteIsToken0 ? token1 : token0;
    const decimals0 = decimalsOf(token0);
    const decimals1 = decimalsOf(token1);
    const baseDecimals = quoteIsToken0 ? decimals1 : decimals0;

    const amount0 = BigInt(s.amount0);
    const amount1 = BigInt(s.amount1);
    const quoteAmount = quoteIsToken0 ? amount0 : amount1;
    const baseAmount = quoteIsToken0 ? amount1 : amount0;

    const quoteUsd = Math.abs(Number(formatUnits(quoteAmount, quote.decimals))) * quote.usdPrice;
    const baseFloat = Math.abs(Number(formatUnits(baseAmount, baseDecimals)));

    const entry = byToken.get(baseToken) ?? {
      token: baseToken,
      buyUnits: 0,
      sellUnits: 0,
      buyUsd: 0,
      sellUsd: 0,
      quoteIsToken0,
      quoteDecimals: quote.decimals,
      quoteUsdPrice: quote.usdPrice,
      decimals0,
      decimals1,
      latestTick: s.tick,
      latestBlock: s.blockNumber,
    };

    if (baseAmount < 0n) {
      entry.buyUnits += baseFloat;
      entry.buyUsd += quoteUsd;
    } else if (baseAmount > 0n) {
      entry.sellUnits += baseFloat;
      entry.sellUsd += quoteUsd;
    }

    if (s.blockNumber >= entry.latestBlock) {
      entry.latestTick = s.tick;
      entry.latestBlock = s.blockNumber;
      entry.quoteIsToken0 = quoteIsToken0;
      entry.quoteUsdPrice = quote.usdPrice;
      entry.decimals0 = decimals0;
      entry.decimals1 = decimals1;
    }

    byToken.set(baseToken, entry);
  }

  return byToken;
}

export interface PositionViewUsd {
  token: string;
  balance: number;
  avgCostUsd: number | null;
  currentPriceUsd: number;
  costBasisUsd: number | null;
  currentValueUsd: number;
  unrealizedPnlUsd: number | null;
  realizedPnlUsd: number | null;
}

export function evaluatePositionUsd(pos: TokenPositionUsd, balanceHuman: number): PositionViewUsd {
  const basePriceInQuote = basePriceInWeth(pos.latestTick, pos.quoteIsToken0, pos.decimals0, pos.decimals1);
  const currentPriceUsd = basePriceInQuote * pos.quoteUsdPrice;
  const avgCostUsd = pos.buyUnits > 0 ? pos.buyUsd / pos.buyUnits : null;
  const costBasisUsd = avgCostUsd !== null ? avgCostUsd * balanceHuman : null;
  const currentValueUsd = balanceHuman * currentPriceUsd;
  const unrealizedPnlUsd = costBasisUsd !== null ? currentValueUsd - costBasisUsd : null;
  const realizedPnlUsd = pos.buyUsd > 0 && pos.sellUsd > 0 ? pos.sellUsd - pos.buyUsd : null;

  return {
    token: pos.token,
    balance: balanceHuman,
    avgCostUsd,
    currentPriceUsd,
    costBasisUsd,
    currentValueUsd,
    unrealizedPnlUsd,
    realizedPnlUsd,
  };
}
