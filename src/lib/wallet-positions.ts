import { formatUnits } from "viem";
import { basePriceInWeth } from "./uniswap-price";

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
