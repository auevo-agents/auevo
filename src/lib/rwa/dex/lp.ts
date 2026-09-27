import type { Address, PublicClient } from "viem";
import { Percent, Token } from "@uniswap/sdk-core";
import { Pool as V4Pool, Position, V4PositionManager } from "@uniswap/v4-sdk";
import { TickMath, nearestUsableTick } from "@uniswap/v3-sdk";
import { STATE_VIEW, V4_POSITION_MANAGER, USDG, USDG_DECIMALS } from "./addresses";
import { buildPoolKey, poolId } from "./pool-key";
import { robinhoodChain } from "@/lib/chains";

/**
 * Full-range liquidity provision on an existing RWA/USDG v4 pool —
 * RWA_SPEC.md Phase 8's Pools page said "Adding liquidity — later"; this
 * is that later. Full-range only (not a custom tick range) is a
 * deliberate v1 scope cut: it's the simplest position shape a first LP
 * flow can offer correctly, matches what most casual LPs actually want,
 * and avoids a tick-range picker UI this pass doesn't have room for —
 * narrower, higher-capital-efficiency ranges are a real follow-up, not
 * a limitation of the pool itself.
 *
 * Same "official SDK, not hand-rolled Actions encoding" discipline as
 * dex/build.ts: `@uniswap/v4-sdk`'s own `V4PositionManager` produces the
 * mint calldata, so this file only has to get the *inputs* (which side is
 * USDG, the full-range ticks, the matching-amount math) right, not the
 * byte-level Actions format.
 *
 * No Permit2 batch-signature convenience here (`CommonAddLiquidityOptions.
 * batchPermit` is left unset) — the caller is expected to have already
 * granted Permit2 an on-chain allowance for both tokens to
 * V4_POSITION_MANAGER (two `Permit2.approve` calls, on top of the usual
 * one-time ERC20-to-Permit2 approval), the same boring-but-simple
 * allowance path Permit2 supports as an alternative to a signed permit.
 * A batch-permit signature flow is a real follow-up (saves the user two
 * on-chain approval txs), not something this file assumes.
 */

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
  {
    type: "function",
    name: "getLiquidity",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [{ type: "uint128" }],
  },
] as const;

export interface AddLiquidityParams {
  client: PublicClient;
  /** The non-USDG leg. */
  token: Address;
  tokenDecimals: number;
  tokenSymbol: string;
  fee: number;
  tickSpacing: number;
  hooks: Address;
  /** How much USDG the user wants to put in — the other side's amount is derived from the pool's current price, full-range. */
  amountUsdgIn: bigint;
  recipient: Address;
  slippageBps: number;
  deadline: number; // unix seconds
}

export interface BuiltAddLiquidity {
  to: Address;
  data: `0x${string}`;
  value: bigint;
  /** Exact (pre-slippage) amounts the position actually needs, for display and for sizing the two Permit2 approvals. */
  amountUsdgRequired: string;
  amountTokenRequired: string;
}

export async function buildAddLiquidity(params: AddLiquidityParams): Promise<BuiltAddLiquidity> {
  const key = buildPoolKey(USDG, params.token, params.fee, params.tickSpacing, params.hooks);
  const id = poolId(key);

  const [slot0, liquidity] = await Promise.all([
    params.client.readContract({ address: STATE_VIEW, abi: STATE_VIEW_ABI, functionName: "getSlot0", args: [id] }),
    params.client.readContract({ address: STATE_VIEW, abi: STATE_VIEW_ABI, functionName: "getLiquidity", args: [id] }),
  ]);
  if (slot0[0] === 0n) throw new Error("Pool has no on-chain liquidity yet (not initialized) — cannot quote a position for it.");

  const usdgIsCurrency0 = key.currency0.toLowerCase() === USDG.toLowerCase();
  const currency0 = new Token(
    robinhoodChain.id,
    key.currency0,
    usdgIsCurrency0 ? USDG_DECIMALS : params.tokenDecimals,
    usdgIsCurrency0 ? "USDG" : params.tokenSymbol
  );
  const currency1 = new Token(
    robinhoodChain.id,
    key.currency1,
    usdgIsCurrency0 ? params.tokenDecimals : USDG_DECIMALS,
    usdgIsCurrency0 ? params.tokenSymbol : "USDG"
  );

  const pool = new V4Pool(
    currency0,
    currency1,
    key.fee,
    key.tickSpacing,
    key.hooks,
    slot0[0].toString(),
    liquidity.toString(),
    slot0[1]
  );

  const tickLower = nearestUsableTick(TickMath.MIN_TICK, key.tickSpacing);
  const tickUpper = nearestUsableTick(TickMath.MAX_TICK, key.tickSpacing);

  const position = usdgIsCurrency0
    ? Position.fromAmount0({ pool, tickLower, tickUpper, amount0: params.amountUsdgIn.toString(), useFullPrecision: false })
    : Position.fromAmount1({ pool, tickLower, tickUpper, amount1: params.amountUsdgIn.toString() });

  const { calldata, value } = V4PositionManager.addCallParameters(position, {
    recipient: params.recipient,
    slippageTolerance: new Percent(params.slippageBps, 10_000),
    deadline: params.deadline,
  });

  const { amount0, amount1 } = position.mintAmounts;
  return {
    to: V4_POSITION_MANAGER,
    data: calldata as `0x${string}`,
    value: BigInt(value),
    amountUsdgRequired: (usdgIsCurrency0 ? amount0 : amount1).toString(),
    amountTokenRequired: (usdgIsCurrency0 ? amount1 : amount0).toString(),
  };
}
