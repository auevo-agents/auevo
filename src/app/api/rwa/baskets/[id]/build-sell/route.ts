import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getSupabaseServer } from "@/lib/supabase";
import { getRobinhoodClient } from "@/lib/evm/client";
import { loadBasket, resolveBasketSell } from "@/lib/rwa/baskets";
import { buildBasketSwap, type BasketLeg } from "@/lib/rwa/dex/basket";
import { USDG } from "@/lib/rwa/dex/addresses";

export const maxDuration = 20;

const DEFAULT_SLIPPAGE_BPS = 100;
const DEFAULT_FEE_BPS = 30;
const DEFAULT_DEADLINE_SECONDS = 20 * 60;

interface SellHolding {
  ticker: string;
  /** Raw on-chain units of this holding to sell — the client already knows the wallet's balance and applies 25/50/100% itself. */
  amountIn: string;
  /** Only for a ticker whose held token has no live Permit2 allowance for UniversalRouter yet. */
  permit?: {
    details: { token: string; amount: string; expiration: number; nonce: number };
    spender: string;
    sigDeadline: number;
    signature: string;
  };
}

interface BuildSellBody {
  holdings: SellHolding[];
  recipient: string;
  slippageBps?: number;
}

/**
 * One-signature Strategy basket sell — the mirror of build-buy. Unlike a
 * buy, more than one held token can each need its own Permit2 signature
 * the first time it's sold (see dex/basket.ts's own doc comment on why);
 * the transaction itself is still exactly one wallet signature regardless
 * of how many of those free, off-chain Permit2 signatures preceded it.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/rwa/baskets/[id]/build-sell">) {
  const { id } = await ctx.params;

  let body: BuildSellBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.recipient || !isAddress(body.recipient, { strict: false })) {
    return NextResponse.json({ error: "recipient must be a valid address" }, { status: 400 });
  }
  if (!Array.isArray(body.holdings) || body.holdings.length === 0) {
    return NextResponse.json({ error: "holdings must be a non-empty array" }, { status: 400 });
  }

  let requests: { ticker: string; amountIn: bigint; permit?: SellHolding["permit"] }[];
  try {
    requests = body.holdings.map((h) => {
      const amountIn = BigInt(h.amountIn);
      if (amountIn <= 0n) throw new Error(`non-positive amountIn for ${h.ticker}`);
      return { ticker: h.ticker, amountIn, permit: h.permit };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid holdings";
    return NextResponse.json({ error: message }, { status: 400 });
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
    const slippageBps = body.slippageBps ?? DEFAULT_SLIPPAGE_BPS;

    const { legs: resolvedLegs, excluded } = await resolveBasketSell(client, supabase, basket.chainId, requests, slippageBps);

    if (resolvedLegs.length === 0) {
      return NextResponse.json({ error: "No requested holding has a live route right now", excluded }, { status: 404 });
    }

    const feeBps = process.env.AUEVO_FEE_BPS ? Number(process.env.AUEVO_FEE_BPS) : DEFAULT_FEE_BPS;
    const feeRecipient = process.env.AUEVO_FEE_RECIPIENT as Address | undefined;

    const permitByTicker = new Map(requests.map((r) => [r.ticker, r.permit]));
    const legs: BasketLeg[] = resolvedLegs.map((leg) => ({
      quote: leg.quote,
      amountIn: leg.amountIn,
      amountOutMinimum: leg.amountOutMinimum,
      permit: permitByTicker.get(leg.ticker) as BasketLeg["permit"],
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
      outputToken: USDG,
      legs: resolvedLegs.map((l) => ({
        ticker: l.ticker,
        token: l.token,
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
