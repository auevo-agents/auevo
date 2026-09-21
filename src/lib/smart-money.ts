import type { Trade } from "./geckoterminal";

/**
 * A wallet leaderboard built from trades we already have — not a claim of
 * lifetime PnL or a full-chain indexer. Real "smart money" products
 * (Nansen, GMGN, DEXScreener) label wallets from a complete trade history
 * across every pool on a chain, tracked continuously by their own
 * indexers. We don't have that: only the trades visible in whatever
 * window was fetched (the top N most active pools, above some size
 * floor). This is the best *honest* approximation buildable on that —
 * per-wallet realized profit only for a token where both a buy and a
 * sell are visible in the same window, everything else counted as flow
 * (accumulating vs. distributing) rather than a fabricated win/loss.
 */

export interface WalletAgg {
  address: string;
  tokens: number;
  trades: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  /** buyVolumeUsd - sellVolumeUsd across every token, closed or not. */
  netFlowUsd: number;
  /** Sum of (sell - buy) only for tokens where both sides are visible in this window. */
  realizedPnlUsd: number;
  /** Tokens with both a buy and a sell visible, split by whether that round-trip was profitable. */
  wins: number;
  losses: number;
}

interface TokenFlow {
  buyUsd: number;
  sellUsd: number;
}

export function aggregateWallets(trades: Trade[]): WalletAgg[] {
  const byWallet = new Map<string, { trades: number; perToken: Map<string, TokenFlow> }>();

  for (const t of trades) {
    if (!t.traderAddress || !t.kind) continue;
    const tokenKey = t.baseToken.address ?? t.poolAddress;
    const volumeUsd = t.volumeUsd ?? 0;

    const wallet = byWallet.get(t.traderAddress) ?? { trades: 0, perToken: new Map<string, TokenFlow>() };
    wallet.trades += 1;

    const flow = wallet.perToken.get(tokenKey) ?? { buyUsd: 0, sellUsd: 0 };
    if (t.kind === "buy") flow.buyUsd += volumeUsd;
    else flow.sellUsd += volumeUsd;
    wallet.perToken.set(tokenKey, flow);

    byWallet.set(t.traderAddress, wallet);
  }

  const result: WalletAgg[] = [];
  for (const [address, data] of byWallet) {
    let buyVolumeUsd = 0;
    let sellVolumeUsd = 0;
    let realizedPnlUsd = 0;
    let wins = 0;
    let losses = 0;

    for (const flow of data.perToken.values()) {
      buyVolumeUsd += flow.buyUsd;
      sellVolumeUsd += flow.sellUsd;

      if (flow.buyUsd > 0 && flow.sellUsd > 0) {
        const pnl = flow.sellUsd - flow.buyUsd;
        realizedPnlUsd += pnl;
        if (pnl > 0) wins += 1;
        else losses += 1;
      }
    }

    result.push({
      address,
      tokens: data.perToken.size,
      trades: data.trades,
      buyVolumeUsd,
      sellVolumeUsd,
      netFlowUsd: buyVolumeUsd - sellVolumeUsd,
      realizedPnlUsd,
      wins,
      losses,
    });
  }

  // Wallets with a realized, profitable round-trip float to the top;
  // among the rest (pure accumulation/distribution, no closed position
  // visible yet) net flow is the only signal we actually have.
  return result.sort((a, b) => b.realizedPnlUsd - a.realizedPnlUsd || b.netFlowUsd - a.netFlowUsd);
}
