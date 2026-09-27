import { NextRequest, NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getRobinhoodClient } from "@/lib/evm/client";
import { buildAddLiquidityV3 } from "@/lib/dex-lp";
import { FEE_TIERS } from "@/lib/uniswap";

export const maxDuration = 20;

const DEFAULT_SLIPPAGE_BPS = 100;
const DEFAULT_DEADLINE_SECONDS = 20 * 60;

interface BuildAddLiquidityV3Body {
  tokenA: string;
  tokenB: string;
  decimalsA: number;
  decimalsB: number;
  symbolA?: string;
  symbolB?: string;
  fee: number;
  /** Raw tokenA units the user wants to deposit — tokenB's matching amount is derived server-side from the pool's current price. */
  amountAIn: string;
  recipient: string;
  slippageBps?: number;
}

/**
 * The DEX page's "LP" tab said "Not wired up yet"; this is that, for
 * GENERIC Uniswap v3 pools (see lib/dex-lp.ts). Same "re-derive
 * everything server-side, never trust client-supplied pool state" posture
 * as /api/dex/build: decimals/symbols are accepted from the client (it
 * already read them for the swap panel) but the pool address, price and
 * liquidity are always fetched fresh here.
 */
export async function POST(req: NextRequest) {
  let body: BuildAddLiquidityV3Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { tokenA, tokenB, decimalsA, decimalsB, symbolA, symbolB, fee, amountAIn: amountAInRaw, recipient } = body;

  if (!tokenA || !isAddress(tokenA, { strict: false })) {
    return NextResponse.json({ error: "tokenA must be a valid address" }, { status: 400 });
  }
  if (!tokenB || !isAddress(tokenB, { strict: false })) {
    return NextResponse.json({ error: "tokenB must be a valid address" }, { status: 400 });
  }
  if (tokenA.toLowerCase() === tokenB.toLowerCase()) {
    return NextResponse.json({ error: "tokenA and tokenB must be different" }, { status: 400 });
  }
  if (!recipient || !isAddress(recipient, { strict: false })) {
    return NextResponse.json({ error: "recipient must be a valid address" }, { status: 400 });
  }
  if (typeof decimalsA !== "number" || typeof decimalsB !== "number") {
    return NextResponse.json({ error: "decimalsA/decimalsB are required" }, { status: 400 });
  }
  if (!FEE_TIERS.includes(fee as (typeof FEE_TIERS)[number])) {
    return NextResponse.json({ error: `fee must be one of ${FEE_TIERS.join(", ")}` }, { status: 400 });
  }

  let amountAIn: bigint;
  try {
    amountAIn = BigInt(amountAInRaw);
    if (amountAIn <= 0n) throw new Error("non-positive");
  } catch {
    return NextResponse.json({ error: "amountAIn must be a positive integer (raw units)" }, { status: 400 });
  }

  try {
    const client = getRobinhoodClient();
    const built = await buildAddLiquidityV3({
      client,
      tokenA: tokenA as Address,
      tokenADecimals: decimalsA,
      tokenASymbol: symbolA ?? "TOKEN",
      tokenB: tokenB as Address,
      tokenBDecimals: decimalsB,
      tokenBSymbol: symbolB ?? "TOKEN",
      fee,
      amountAIn,
      recipient: recipient as Address,
      slippageBps: body.slippageBps ?? DEFAULT_SLIPPAGE_BPS,
      deadline: Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS,
    });

    return NextResponse.json({
      to: built.to,
      data: built.data,
      value: built.value.toString(),
      poolAddress: built.poolAddress,
      amountARequired: built.amountARequired,
      amountBRequired: built.amountBRequired,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
