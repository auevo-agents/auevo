import { formatUnits } from "viem";
import type { QuoteAssetPrice } from "./quote-asset";

/**
 * A wallet leaderboard from our own indexer — the thing the original
 * Smart Money rebuild (see smart-money.ts) couldn't do yet, because
 * there was no continuous data source behind it: GeckoTerminal only
 * gives whatever trades are visible in one fetch window across the top
 * N pools. This reads indexer_swaps instead, so "this window" is
 * whatever the indexer has actually reached (a rolling recent slice —
 * see lib/indexer/run.ts — not a single API call's worth), and prices
 * every trade in exact ETH via the swap's own WETH leg rather than
 * approximating from a volume field.
 *
 * Attribution uses `recipient`, not `sender` — sender is usually the
 * router contract that executed the swap, not the person who initiated
 * it; recipient is who the swap's output actually went to. Same
 * reasoning already documented on the wallet profile page.
 */

const WETH_DECIMALS = 18;

export interface IndexedSwapInput {
  recipient: string;
  amount0: string;
  amount1: string;
  token0: string;
  token1: string;
}

export interface WalletLeaderboardEntry {
  wallet: string;
  realizedPnlEth: number;
  wins: number;
  losses: number;
  /** Net ETH received across everything (closed or not) — positive means net seller (received more ETH than paid). */
  netFlowEth: number;
  tokensTraded: number;
  trades: number;
}

export function aggregateIndexedWallets(
  swaps: IndexedSwapInput[],
  wethAddress: string
): WalletLeaderboardEntry[] {
  const weth = wethAddress.toLowerCase();
  const byWallet = new Map<string, Map<string, { buyEth: number; sellEth: number }>>();
  const tradeCounts = new Map<string, number>();

  for (const s of swaps) {
    const token0 = s.token0.toLowerCase();
    const token1 = s.token1.toLowerCase();
    const wethIsToken0 = token0 === weth;
    const wethIsToken1 = token1 === weth;
    if (wethIsToken0 === wethIsToken1) continue; // neither or both are WETH — no ETH cost basis for this swap

    const wallet = s.recipient.toLowerCase();
    const baseToken = wethIsToken0 ? token1 : token0;
    const amount0 = BigInt(s.amount0);
    const amount1 = BigInt(s.amount1);
    const wethAmount = wethIsToken0 ? amount0 : amount1;
    // Pool's perspective: negative base amount = wallet received it (bought); positive = wallet paid it (sold).
    const baseAmount = wethIsToken0 ? amount1 : amount0;

    const wethFloat = Math.abs(Number(formatUnits(wethAmount, WETH_DECIMALS)));

    const perToken = byWallet.get(wallet) ?? new Map<string, { buyEth: number; sellEth: number }>();
    const entry = perToken.get(baseToken) ?? { buyEth: 0, sellEth: 0 };
    if (baseAmount < 0n) entry.buyEth += wethFloat;
    else if (baseAmount > 0n) entry.sellEth += wethFloat;
    perToken.set(baseToken, entry);
    byWallet.set(wallet, perToken);

    tradeCounts.set(wallet, (tradeCounts.get(wallet) ?? 0) + 1);
  }

  const results: WalletLeaderboardEntry[] = [];
  for (const [wallet, perToken] of byWallet) {
    let realizedPnlEth = 0;
    let wins = 0;
    let losses = 0;
    let netFlowEth = 0;

    for (const { buyEth, sellEth } of perToken.values()) {
      netFlowEth += sellEth - buyEth;
      if (buyEth > 0 && sellEth > 0) {
        const pnl = sellEth - buyEth;
        realizedPnlEth += pnl;
        if (pnl > 0) wins += 1;
        else losses += 1;
      }
    }

    results.push({
      wallet,
      realizedPnlEth,
      wins,
      losses,
      netFlowEth,
      tokensTraded: perToken.size,
      trades: tradeCounts.get(wallet) ?? 0,
    });
  }

  // Same tiering as smart-money.ts's aggregateWallets: a proven winner
  // (positive realized PnL) outranks a wallet with nothing closed yet
  // (0), which in turn outranks a proven loser (negative) — the sort
  // falls out of that ordering on realizedPnlEth alone.
  return results.sort((a, b) => b.realizedPnlEth - a.realizedPnlEth || b.netFlowEth - a.netFlowEth);
}

/**
 * RWA_SPEC.md Phase 6's "stock leaderboard" — `aggregateIndexedWallets`
 * above is untouched (still ETH-only, still what the memecoin Smart Money
 * page reads). This is the USD/multi-quote-asset sibling for the RWA
 * scanner's Smart Money tab: same recipient-not-sender attribution (see
 * this file's own top comment — v4's swaps carry tx.from in this same
 * `recipient` field, see indexer/scan-v4.ts, so no special-casing is
 * needed here), generalized over any recognized quote asset and priced in
 * USD. Callers are expected to pre-filter `swaps` to ones involving a
 * known RWA token before calling this — this function itself doesn't know
 * what a "stock" is, only how to price a quote-asset leg, same separation
 * of concerns as the rest of this module.
 */
export interface WalletLeaderboardEntryUsd {
  wallet: string;
  realizedPnlUsd: number;
  wins: number;
  losses: number;
  netFlowUsd: number;
  tokensTraded: number;
  trades: number;
}

export function aggregateIndexedWalletsUsd(swaps: IndexedSwapInput[], quoteAssets: QuoteAssetPrice[]): WalletLeaderboardEntryUsd[] {
  const quoteByAddress = new Map(quoteAssets.map((q) => [q.address.toLowerCase(), q]));
  const byWallet = new Map<string, Map<string, { buyUsd: number; sellUsd: number }>>();
  const tradeCounts = new Map<string, number>();

  for (const s of swaps) {
    const token0 = s.token0.toLowerCase();
    const token1 = s.token1.toLowerCase();
    const quote0 = quoteByAddress.get(token0);
    const quote1 = quoteByAddress.get(token1);
    if (Boolean(quote0) === Boolean(quote1)) continue;

    const quote = quote0 ?? quote1!;
    const wallet = s.recipient.toLowerCase();
    const baseToken = quote0 ? token1 : token0;
    const amount0 = BigInt(s.amount0);
    const amount1 = BigInt(s.amount1);
    const quoteAmount = quote0 ? amount0 : amount1;
    const baseAmount = quote0 ? amount1 : amount0;

    const quoteUsd = Math.abs(Number(formatUnits(quoteAmount, quote.decimals))) * quote.usdPrice;

    const perToken = byWallet.get(wallet) ?? new Map<string, { buyUsd: number; sellUsd: number }>();
    const entry = perToken.get(baseToken) ?? { buyUsd: 0, sellUsd: 0 };
    if (baseAmount < 0n) entry.buyUsd += quoteUsd;
    else if (baseAmount > 0n) entry.sellUsd += quoteUsd;
    perToken.set(baseToken, entry);
    byWallet.set(wallet, perToken);

    tradeCounts.set(wallet, (tradeCounts.get(wallet) ?? 0) + 1);
  }

  const results: WalletLeaderboardEntryUsd[] = [];
  for (const [wallet, perToken] of byWallet) {
    let realizedPnlUsd = 0;
    let wins = 0;
    let losses = 0;
    let netFlowUsd = 0;

    for (const { buyUsd, sellUsd } of perToken.values()) {
      netFlowUsd += sellUsd - buyUsd;
      if (buyUsd > 0 && sellUsd > 0) {
        const pnl = sellUsd - buyUsd;
        realizedPnlUsd += pnl;
        if (pnl > 0) wins += 1;
        else losses += 1;
      }
    }

    results.push({
      wallet,
      realizedPnlUsd,
      wins,
      losses,
      netFlowUsd,
      tokensTraded: perToken.size,
      trades: tradeCounts.get(wallet) ?? 0,
    });
  }

  return results.sort((a, b) => b.realizedPnlUsd - a.realizedPnlUsd || b.netFlowUsd - a.netFlowUsd);
}
