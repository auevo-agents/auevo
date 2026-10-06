import { formatUnits, parseUnits, type Address, type PublicClient } from "viem";
import { USDG } from "./dex/addresses";
import { quoteRoute } from "./dex/quote";

/**
 * RWA_SPEC.md Phase 5's Liquidity scanner tab — "for every token, quote
 * at $1K/$10K/$100K → price impact". $1K/$10K/$100K was checked against
 * outside precedent (CoinMarketCap's own liquidity-score methodology
 * simulates orders across roughly this same $100–$200K range) rather than
 * assumed — it's a reasonable, if not perfectly standardized, convention.
 *
 * Robinhood-Chain-only: this quotes live against the same Uniswap v3/v4
 * infrastructure Phase 2's swap panel uses (rwa/dex/quote.ts), which only
 * exists on Robinhood Chain. The five bridge-target chains (rwa/lifi/
 * chains.ts) have no equivalent here yet — their liquidity lives on
 * whatever DEX each token's own pool is on, which this app has no reader
 * for. Documented gap, not silently skipped.
 *
 * USDG is treated as $1 (it's Paxos' USD-pegged Global Dollar) — an
 * assumption, not a live oracle read, same simplification this app
 * already makes implicitly everywhere USDG is the quote asset.
 */

export const DEPTH_BUCKETS_USD = [1_000, 10_000, 100_000] as const;
const USDG_DECIMALS = 6;

export interface DepthQuote {
  usdIn: number;
  /** null = no route found at this size (route.ts already tries direct + a 2-hop through USDG). */
  amountOut: bigint | null;
  /** Percent below the reference-price-implied amount — null when there's no route, or no reference price to compare against. */
  priceImpactPct: number | null;
}

/** Pure — no RPC — so this half of the computation is unit-testable on its own. */
export function computePriceImpactPct(usdIn: number, amountOut: bigint, tokenOutDecimals: number, referencePriceUsd: number | null): number | null {
  if (!referencePriceUsd || referencePriceUsd <= 0) return null;
  const expectedTokens = usdIn / referencePriceUsd;
  if (expectedTokens <= 0) return null;
  const actualTokens = Number(formatUnits(amountOut, tokenOutDecimals));
  return ((expectedTokens - actualTokens) / expectedTokens) * 100;
}

export async function quoteDepth(
  client: PublicClient,
  tokenOut: Address,
  tokenOutDecimals: number,
  referencePriceUsd: number | null
): Promise<DepthQuote[]> {
  // The three buckets are independent quotes — no reason to serialize them.
  // This route's own maxDuration comment already flags how many RPC round-
  // trips a full page load costs; running sequentially here made that up to
  // 3x worse than it needed to be, which was tipping page loads (15 tokens)
  // over Vercel's function timeout and surfacing as a bare "Network error"
  // client-side rather than a real result.
  return Promise.all(
    DEPTH_BUCKETS_USD.map(async (usdIn) => {
      const amountInUsdg = parseUnits(usdIn.toString(), USDG_DECIMALS);
      const route = await quoteRoute(client, USDG, tokenOut, amountInUsdg);
      if (!route) return { usdIn, amountOut: null, priceImpactPct: null };
      return {
        usdIn,
        amountOut: route.amountOut,
        priceImpactPct: computePriceImpactPct(usdIn, route.amountOut, tokenOutDecimals, referencePriceUsd),
      };
    })
  );
}
