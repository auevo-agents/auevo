import type { Address, PublicClient } from "viem";
import {
  FEE_TIERS,
  UNISWAP_QUOTER_V2,
  UNISWAP_V3_FACTORY,
  V4_FEE_TIERS,
  V4_QUOTER,
  STATE_VIEW,
  USDG,
  WETH9,
  ZERO_ADDRESS,
} from "./addresses";
import { buildPoolKey, poolId, type PoolKey } from "./pool-key";

/**
 * Route discovery across both Uniswap versions live on Robinhood Chain —
 * RWA_SPEC.md Phase 2's "SwapPanel: выбирает лучший из v3 и v4 маршрутов".
 * No assumption about which version a given pair actually uses: v3 has
 * been the only option for memecoin pools so far, but HyperDex's own
 * research (RWA_SPEC.md section 2) found RWA/USDG liquidity specifically
 * on v4. Both get probed and the better quote wins, per pair.
 *
 * A v4 pool has no factory to ask "does this exist" the way v3 does
 * (`factory.getPool`) — v4 is one PoolManager singleton keyed by a hash of
 * the pool's parameters (see pool-key.ts). Existence is checked via
 * StateView.getSlot0: an uninitialized pool reads back sqrtPriceX96 = 0.
 */

const V3_FACTORY_ABI = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }],
    outputs: [{ type: "address" }],
  },
] as const;

/** ISwapRouter/IQuoterV2 (v3-periphery) — same shape already used client-side in swap-panel.tsx. */
const V3_QUOTER_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

/**
 * IV4Quoter (v4-periphery, src/interfaces/IV4Quoter.sol — fetched
 * 2026-09-26 directly from github.com/Uniswap/v4-periphery to get the
 * exact struct layout, not guessed from the v3 shape). `exactAmount` is
 * uint128 here, not uint256 like v3's quoter.
 */
const V4_QUOTER_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        type: "tuple",
        components: [
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
            ],
          },
          { name: "zeroForOne", type: "bool" },
          { name: "exactAmount", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

/** IStateView.getSlot0 (v4-periphery) — sqrtPriceX96 == 0 means the pool was never initialized. */
const STATE_VIEW_ABI = [
  {
    type: "function",
    name: "getSlot0",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
  },
] as const;

export interface LegQuoteV3 {
  protocol: "v3";
  tokenIn: Address;
  tokenOut: Address;
  fee: number;
  poolAddress: Address;
  amountOut: bigint;
}

export interface LegQuoteV4 {
  protocol: "v4";
  tokenIn: Address;
  tokenOut: Address;
  poolKey: PoolKey;
  zeroForOne: boolean;
  amountOut: bigint;
}

export type LegQuote = LegQuoteV3 | LegQuoteV4;

/**
 * `WETH9` is this app's existing "native ETH" placeholder address (same
 * convention as uniswap.ts/swap-panel.tsx: v3 has no native-currency
 * concept, so the UI has always used WETH9 in that slot and paid/received
 * real ETH by wrapping at the router). v4 pools *can* use true native
 * currency (address(0)) directly instead of WETH9 — HyperDex's own
 * research didn't say which one Robinhood Chain's RWA/USDG pools use, so
 * both representations get probed whenever a leg involves WETH9, and
 * whichever one actually has a pool wins.
 */
function v4CandidatesFor(address: Address): Address[] {
  return address.toLowerCase() === WETH9.toLowerCase()
    ? [WETH9, ZERO_ADDRESS]
    : [address];
}

async function bestV3Leg(
  client: PublicClient,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint
): Promise<LegQuoteV3 | null> {
  let best: LegQuoteV3 | null = null;

  for (const fee of FEE_TIERS) {
    const pool = await client.readContract({
      address: UNISWAP_V3_FACTORY,
      abi: V3_FACTORY_ABI,
      functionName: "getPool",
      args: [tokenIn, tokenOut, fee],
    });
    if (pool === ZERO_ADDRESS) continue;

    try {
      const result = await client.readContract({
        address: UNISWAP_QUOTER_V2,
        abi: V3_QUOTER_ABI,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
      });
      const amountOut = result[0];
      if (!best || amountOut > best.amountOut) {
        best = { protocol: "v3", tokenIn, tokenOut, fee, poolAddress: pool, amountOut };
      }
    } catch {
      // Pool exists but not enough liquidity to quote this size — try the next tier.
    }
  }

  return best;
}

async function bestV4Leg(
  client: PublicClient,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint
): Promise<LegQuoteV4 | null> {
  let best: LegQuoteV4 | null = null;

  for (const currencyIn of v4CandidatesFor(tokenIn)) {
    for (const currencyOut of v4CandidatesFor(tokenOut)) {
      for (const fee of V4_FEE_TIERS) {
        const tickSpacing = { 100: 1, 500: 10, 3000: 60, 10000: 200 }[fee]!;
        const key = buildPoolKey(currencyIn, currencyOut, fee, tickSpacing);
        const id = poolId(key);

        const slot0 = await client.readContract({
          address: STATE_VIEW,
          abi: STATE_VIEW_ABI,
          functionName: "getSlot0",
          args: [id],
        });
        if (slot0[0] === 0n) continue; // uninitialized — no pool here

        const zeroForOne = currencyIn.toLowerCase() === key.currency0.toLowerCase();

        try {
          const result = await client.readContract({
            address: V4_QUOTER,
            abi: V4_QUOTER_ABI,
            functionName: "quoteExactInputSingle",
            args: [{ poolKey: key, zeroForOne, exactAmount: amountIn, hookData: "0x" }],
          });
          const amountOut = result[0];
          if (!best || amountOut > best.amountOut) {
            best = { protocol: "v4", tokenIn, tokenOut, poolKey: key, zeroForOne, amountOut };
          }
        } catch {
          // Initialized but too thin to fill this size — try the next candidate.
        }
      }
    }
  }

  return best;
}

/** The better of v3 and v4 for one hop — never both; a route may still chain two of these (see quoteRoute). */
export async function bestLeg(
  client: PublicClient,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint
): Promise<LegQuote | null> {
  const [v3, v4] = await Promise.all([
    bestV3Leg(client, tokenIn, tokenOut, amountIn),
    bestV4Leg(client, tokenIn, tokenOut, amountIn),
  ]);
  if (!v3) return v4;
  if (!v4) return v3;
  return v4.amountOut > v3.amountOut ? v4 : v3;
}

export interface RouteQuote {
  legs: LegQuote[];
  amountOut: bigint;
}

/**
 * Direct pair first; if none exists, a 2-hop through USDG — the quote
 * asset every RWA pool trades against (RWA_SPEC.md section 2), so this is
 * how an ETH-in trade for a stock finds its way there (ETH/WETH -> USDG on
 * whichever version has that pool, then USDG -> STOCK on whichever version
 * has that one) without hardcoding a single path. Each leg is priced
 * independently and chained; there is no attempt to find a jointly-optimal
 * split across multiple paths (that is what LI.FI is for once Phase 4
 * brings in outside liquidity — this is single-DEX, single-path routing
 * scoped to what Robinhood Chain itself offers).
 */
export async function quoteRoute(
  client: PublicClient,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint
): Promise<RouteQuote | null> {
  if (tokenIn.toLowerCase() === tokenOut.toLowerCase()) return null;

  const direct = await bestLeg(client, tokenIn, tokenOut, amountIn);
  if (direct) return { legs: [direct], amountOut: direct.amountOut };

  if (
    tokenIn.toLowerCase() === USDG.toLowerCase() ||
    tokenOut.toLowerCase() === USDG.toLowerCase()
  ) {
    return null; // one side is already USDG — a "direct" pool is the only path, and none was found
  }

  const leg1 = await bestLeg(client, tokenIn, USDG, amountIn);
  if (!leg1) return null;

  const leg2 = await bestLeg(client, USDG, tokenOut, leg1.amountOut);
  if (!leg2) return null;

  return { legs: [leg1, leg2], amountOut: leg2.amountOut };
}
