import type { Address, PublicClient } from "viem";
import { Percent, Token } from "@uniswap/sdk-core";
import {
  FeeAmount,
  NonfungiblePositionManager,
  Pool,
  Position,
  TICK_SPACINGS,
  TickMath,
  nearestUsableTick,
} from "@uniswap/v3-sdk";
import { UNISWAP_NFT_POSITION_MANAGER, UNISWAP_V3_FACTORY } from "@/lib/uniswap";
import { robinhoodChain } from "@/lib/chains";

/**
 * Full-range liquidity provision on an existing GENERIC Uniswap v3 pool —
 * the DEX page's "LP" tab said "Not wired up yet"; this is that. Same
 * full-range-only v1 scope cut as the RWA/USDG v4 flow in
 * lib/rwa/dex/lp.ts, for the same reasons (simplest position shape a
 * first LP flow can offer correctly; a tick-range picker is a real
 * follow-up, not a limitation of the pool itself).
 *
 * Same "official SDK, not hand-rolled mint calldata" discipline as the v4
 * flow: `@uniswap/v3-sdk`'s own `NonfungiblePositionManager` produces the
 * mint calldata, so this file only has to get the *inputs* right.
 *
 * Unlike the v4 `Pool` class (which needs pre-sorted currency0/currency1
 * via buildPoolKey), v3's `Pool` constructor sorts tokenA/tokenB
 * internally — so the only bookkeeping here is figuring out, AFTER
 * construction, which of pool.token0/token1 is the caller's "amountAIn"
 * side.
 *
 * Pool discovery reads the factory directly (`getPool`) rather than the
 * SDK's deterministic `computePoolAddress` — the same pattern already
 * used by swap-panel.tsx's own quote probe, so a pool this app already
 * knows how to find for swaps is found the same way here.
 *
 * No Permit2 batch-signature convenience here, same reasoning as the v4
 * flow — the caller is expected to have already approved both tokens to
 * UNISWAP_NFT_POSITION_MANAGER directly (a plain ERC-20 `approve`, not a
 * Permit2 allowance — v3's NonfungiblePositionManager takes tokens via a
 * regular `transferFrom`, unlike v4's Permit2-based PositionManager).
 */

const FACTORY_ABI = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }],
    outputs: [{ type: "address" }],
  },
] as const;

/** slot0/liquidity: github.com/Uniswap/v3-core IUniswapV3PoolState. */
const POOL_ABI = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "liquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint128" }],
  },
] as const;

const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

export interface AddLiquidityV3Params {
  client: PublicClient;
  tokenA: Address;
  tokenADecimals: number;
  tokenASymbol: string;
  tokenB: Address;
  tokenBDecimals: number;
  tokenBSymbol: string;
  fee: number;
  /** How much of tokenA the user wants to put in — tokenB's matching amount is derived from the pool's current price, full-range. */
  amountAIn: bigint;
  recipient: Address;
  slippageBps: number;
  deadline: number; // unix seconds
}

export interface BuiltAddLiquidityV3 {
  to: Address;
  data: `0x${string}`;
  value: bigint;
  poolAddress: Address;
  /** Exact (pre-slippage) amounts the position actually needs, for display and for sizing the two approvals. */
  amountARequired: string;
  amountBRequired: string;
}

export async function buildAddLiquidityV3(params: AddLiquidityV3Params): Promise<BuiltAddLiquidityV3> {
  const tickSpacing = TICK_SPACINGS[params.fee as FeeAmount];
  if (!tickSpacing) {
    throw new Error(`Unsupported fee tier: ${params.fee}`);
  }

  const poolAddress = await params.client.readContract({
    address: UNISWAP_V3_FACTORY,
    abi: FACTORY_ABI,
    functionName: "getPool",
    args: [params.tokenA, params.tokenB, params.fee],
  });
  if (poolAddress === ZERO_ADDRESS) {
    throw new Error("No pool exists for this pair on this fee tier.");
  }

  const [slot0, liquidity] = await Promise.all([
    params.client.readContract({ address: poolAddress, abi: POOL_ABI, functionName: "slot0" }),
    params.client.readContract({ address: poolAddress, abi: POOL_ABI, functionName: "liquidity" }),
  ]);
  if (slot0[0] === 0n) {
    throw new Error("Pool has no on-chain liquidity yet (not initialized) — cannot quote a position for it.");
  }

  const tokenA = new Token(robinhoodChain.id, params.tokenA, params.tokenADecimals, params.tokenASymbol);
  const tokenB = new Token(robinhoodChain.id, params.tokenB, params.tokenBDecimals, params.tokenBSymbol);

  const pool = new Pool(tokenA, tokenB, params.fee, slot0[0].toString(), liquidity.toString(), slot0[1]);

  const tickLower = nearestUsableTick(TickMath.MIN_TICK, tickSpacing);
  const tickUpper = nearestUsableTick(TickMath.MAX_TICK, tickSpacing);

  const aIsToken0 = pool.token0.address.toLowerCase() === params.tokenA.toLowerCase();
  const position = aIsToken0
    ? Position.fromAmount0({ pool, tickLower, tickUpper, amount0: params.amountAIn.toString(), useFullPrecision: false })
    : Position.fromAmount1({ pool, tickLower, tickUpper, amount1: params.amountAIn.toString() });

  const { calldata, value } = NonfungiblePositionManager.addCallParameters(position, {
    recipient: params.recipient,
    slippageTolerance: new Percent(params.slippageBps, 10_000),
    deadline: params.deadline,
  });

  const { amount0, amount1 } = position.mintAmounts;
  return {
    to: UNISWAP_NFT_POSITION_MANAGER,
    data: calldata as `0x${string}`,
    value: BigInt(value),
    poolAddress,
    amountARequired: (aIsToken0 ? amount0 : amount1).toString(),
    amountBRequired: (aIsToken0 ? amount1 : amount0).toString(),
  };
}
