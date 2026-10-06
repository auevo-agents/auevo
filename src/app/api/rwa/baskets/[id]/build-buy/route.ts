import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getSupabaseServer } from "@/lib/supabase";
import { getRobinhoodClient } from "@/lib/evm/client";
import { loadBasket, resolveBasketBuy, type BasketWeightMode } from "@/lib/rwa/baskets";
import { buildBasketSwap, type BasketLeg } from "@/lib/rwa/dex/basket";
import { USDG } from "@/lib/rwa/dex/addresses";

export const maxDuration = 20;

const DEFAULT_SLIPPAGE_BPS = 100;
const DEFAULT_FEE_BPS = 30;
const DEFAULT_DEADLINE_SECONDS = 20 * 60;

interface BuildBuyBody {
  amountIn: string; // raw USDG units (6 decimals)
  recipient: string;
  weightMode?: BasketWeightMode;
  customWeights?: Record<string, number>;
  slippageBps?: number;
  /** Only for USDG when the wallet has no live Permit2 allowance for UniversalRouter yet — same shape /api/dex/build already accepts. */
  permit?: {
    details: { token: string; amount: string; expiration: number; nonce: number };
    spender: string;
    sigDeadline: number;
    signature: string;
  };
}

/**
 * One-signature Strategy basket buy — RWA_SPEC.md Phase 7's "buying a
 * basket ... with one signature". Mirrors /api/dex/build's own posture: the
 * client never assembles calldata itself, and every leg is re-quoted
 * fresh here (never trusting client-supplied prices), so a stale UI state
 * can't point a leg at a route this server didn't itself just verify.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/rwa/baskets/[id]/build-buy">) {
  const { id } = await ctx.params;

  let body: BuildBuyBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.recipient || !isAddress(body.recipient, { strict: false })) {
    return NextResponse.json({ error: "recipient must be a valid address" }, { status: 400 });
  }

  let amountIn: bigint;
  try {
    amountIn = BigInt(body.amountIn);
    if (amountIn <= 0n) throw new Error("non-positive");
  } catch {
    return NextResponse.json({ error: "amountIn must be a positive integer (raw USDG units)" }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  try {
    const basket = await loadBasket(supabase, id);
    if (!basket) {
      return NextResponse.json({ error: "Unknown basket" }, { status: 404 });
    }

    const client = getRobinhoodClient();
    const weightMode = body.weightMode ?? "target";
    const slippageBps = body.slippageBps ?? DEFAULT_SLIPPAGE_BPS;

    const { legs: resolvedLegs, excluded } = await resolveBasketBuy(
      client,
      supabase,
      basket,
      amountIn,
      slippageBps,
      weightMode,
      body.customWeights
    );

    if (resolvedLegs.length === 0) {
      return NextResponse.json({ error: "No basket constituent has a live route right now", excluded }, { status: 404 });
    }

    const feeBps = process.env.AUEVO_FEE_BPS ? Number(process.env.AUEVO_FEE_BPS) : DEFAULT_FEE_BPS;
    const feeRecipient = process.env.AUEVO_FEE_RECIPIENT as Address | undefined;

    // Every leg shares the one USDG input, so at most one permit applies —
    // attached to every leg is harmless (buildBasketSwap emits one
    // PERMIT2_PERMIT command per leg that carries one, and they'd all be
    // identical here anyway); simplest is to attach it to the first leg
    // only, so the plan gets exactly one PERMIT2_PERMIT command.
    const permit = body.permit as BasketLeg["permit"] | undefined;
    const legs: BasketLeg[] = resolvedLegs.map((leg, i) => ({
      quote: leg.quote,
      amountIn: leg.amountIn,
      amountOutMinimum: leg.amountOutMinimum,
      permit: i === 0 ? permit : undefined,
    }));

    const built = buildBasketSwap({
      legs,
      recipient: body.recipient as Address,
      deadline: Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS,
      feeBps: feeRecipient ? feeBps : 0,
      feeRecipient: feeRecipient ?? ("0x0000000000000000000000000000000000000000" as Address),
    });

    return NextResponse.json({
      to: built.to,
      data: built.data,
      value: built.value.toString(),
      inputToken: USDG,
      legs: resolvedLegs.map((l) => ({
        ticker: l.ticker,
        token: l.token,
        weight: l.weight,
        amountIn: l.amountIn.toString(),
        amountOutMinimum: l.amountOutMinimum.toString(),
        protocol: l.quote.protocol,
      })),
      excluded,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
