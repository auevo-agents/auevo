import { NextRequest, NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getRobinhoodClient } from "@/lib/evm/client";
import { quoteRoute } from "@/lib/rwa/dex/quote";
import { buildSwap } from "@/lib/rwa/dex/build";

export const maxDuration = 20;

const DEFAULT_FEE_BPS = 30;
const DEFAULT_SLIPPAGE_BPS = 100;
const DEFAULT_DEADLINE_SECONDS = 20 * 60;

interface BuildRequestBody {
  tokenIn: string;
  tokenOut: string;
  decimalsIn: number;
  decimalsOut: number;
  symbolIn?: string;
  symbolOut?: string;
  amountIn: string;
  nativeIn?: boolean;
  nativeOut?: boolean;
  slippageBps?: number;
  recipient: string;
  permit?: {
    details: { token: string; amount: string; expiration: number; nonce: number };
    spender: string;
    sigDeadline: number;
    signature: string;
  };
}

/**
 * Turns a size + pair into signable/sendable transaction data — the
 * client never assembles UniversalRouter calldata itself. The route is
 * re-quoted here from scratch (never trusting a route/pool the client
 * claims to have already found) so a stale or manipulated client request
 * can't point the swap at a pool this server didn't itself just verify is
 * live; see src/lib/rwa/dex/build.ts for why the pool state used to build
 * the trade is also re-fetched fresh here rather than reused from the
 * quote step.
 */
export async function POST(req: NextRequest) {
  let body: BuildRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { tokenIn, tokenOut, decimalsIn, decimalsOut, symbolIn, symbolOut, amountIn: amountInRaw, recipient } = body;

  if (!tokenIn || !isAddress(tokenIn, { strict: false })) {
    return NextResponse.json({ error: "tokenIn must be a valid address" }, { status: 400 });
  }
  if (!tokenOut || !isAddress(tokenOut, { strict: false })) {
    return NextResponse.json({ error: "tokenOut must be a valid address" }, { status: 400 });
  }
  if (!recipient || !isAddress(recipient, { strict: false })) {
    return NextResponse.json({ error: "recipient must be a valid address" }, { status: 400 });
  }
  if (typeof decimalsIn !== "number" || typeof decimalsOut !== "number") {
    return NextResponse.json({ error: "decimalsIn/decimalsOut are required" }, { status: 400 });
  }

  let amountIn: bigint;
  try {
    amountIn = BigInt(amountInRaw);
    if (amountIn <= 0n) throw new Error("non-positive");
  } catch {
    return NextResponse.json({ error: "amountIn must be a positive integer (raw units)" }, { status: 400 });
  }

  try {
    const client = getRobinhoodClient();
    const route = await quoteRoute(client, tokenIn as Address, tokenOut as Address, amountIn);
    if (!route) {
      return NextResponse.json({ error: "No live route found for this pair/size" }, { status: 404 });
    }

    const feeBps = process.env.AUEVO_FEE_BPS ? Number(process.env.AUEVO_FEE_BPS) : DEFAULT_FEE_BPS;
    const feeRecipient = process.env.AUEVO_FEE_RECIPIENT as Address | undefined;

    const built = await buildSwap({
      client,
      route,
      tokenIn: { address: tokenIn as Address, decimals: decimalsIn, symbol: symbolIn },
      tokenOut: { address: tokenOut as Address, decimals: decimalsOut, symbol: symbolOut },
      amountIn,
      nativeIn: Boolean(body.nativeIn),
      nativeOut: Boolean(body.nativeOut),
      slippageBps: body.slippageBps ?? DEFAULT_SLIPPAGE_BPS,
      recipient: recipient as Address,
      deadline: Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS,
      // No recipient configured means no fee is taken, not a fee sent nowhere.
      feeBps: feeRecipient ? feeBps : 0,
      feeRecipient: feeRecipient ?? ("0x0000000000000000000000000000000000000000" as Address),
      permit: body.permit as Parameters<typeof buildSwap>[0]["permit"],
    });

    return NextResponse.json({
      to: built.to,
      data: built.data,
      value: built.value.toString(),
      amountOut: route.amountOut.toString(),
      route: route.legs.map((leg) => leg.protocol),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
