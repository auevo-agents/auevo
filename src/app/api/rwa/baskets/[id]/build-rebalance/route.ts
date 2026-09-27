import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getSupabaseServer } from "@/lib/supabase";
import { getRobinhoodClient } from "@/lib/evm/client";
import { loadBasket, resolveBasketRebalance } from "@/lib/rwa/baskets";
import { buildBasketSwap, type BasketLeg } from "@/lib/rwa/dex/basket";
import { USDG } from "@/lib/rwa/dex/addresses";

export const maxDuration = 20;

const DEFAULT_SLIPPAGE_BPS = 100;
const DEFAULT_DRIFT_THRESHOLD_BPS = 300; // 3% — a basket within this of its own target weights isn't flagged for a trade
const DEFAULT_FEE_BPS = 30;
const DEFAULT_DEADLINE_SECONDS = 20 * 60;

interface SignedPermitBody {
  details: { token: string; amount: string; expiration: number; nonce: number };
  spender: string;
  sigDeadline: number;
  signature: string;
}

interface BuildRebalanceBody {
  /** This wallet's current on-chain balance of each basket ticker's verified token, raw units — the client already reads these for the buy/sell forms on this same page. */
  holdings: { ticker: string; balance: string }[];
  recipient: string;
  driftThresholdBps?: number;
  slippageBps?: number;
  /** Optional signed Permit2 permits, keyed by token address — USDG's for any buy leg, a held token's for any sell leg of it. Omit any the wallet doesn't need yet; a leg whose input token needs one but doesn't have it will simply fail on-chain, the same as buy/sell today. */
  permits?: Record<string, SignedPermitBody>;
}

/**
 * Non-custodial "automated basket" rebalancing — see baskets.ts's own
 * doc comment on resolveBasketRebalance for why this is the version of
 * HyperDex's "Automated Baskets" that doesn't need Auevo to run its own
 * custodial automated-vault contract (RWA_SPEC.md section 9 rules that
 * out). Detects drift from the basket's own stated target weights and,
 * if it's past the threshold, returns the one-signature trade that
 * corrects it — same shape as build-buy/build-sell, just computed from a
 * live position instead of a fresh deposit.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/rwa/baskets/[id]/build-rebalance">) {
  const { id } = await ctx.params;

  let body: BuildRebalanceBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.recipient || !isAddress(body.recipient, { strict: false })) {
    return NextResponse.json({ error: "recipient must be a valid address" }, { status: 400 });
  }
  if (!Array.isArray(body.holdings)) {
    return NextResponse.json({ error: "holdings must be an array" }, { status: 400 });
  }

  let holdings: { ticker: string; balance: bigint }[];
  try {
    holdings = body.holdings.map((h) => ({ ticker: h.ticker, balance: BigInt(h.balance) }));
  } catch {
    return NextResponse.json({ error: "Each holding's balance must be an integer string" }, { status: 400 });
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
    const driftThresholdBps = body.driftThresholdBps ?? DEFAULT_DRIFT_THRESHOLD_BPS;
    const slippageBps = body.slippageBps ?? DEFAULT_SLIPPAGE_BPS;

    const rebalance = await resolveBasketRebalance(client, supabase, basket, holdings, driftThresholdBps, slippageBps);

    if (!rebalance.needed) {
      return NextResponse.json({
        needed: false,
        driftBps: rebalance.driftBps,
        driftThresholdBps,
        excluded: rebalance.excluded,
      });
    }

    const feeBps = process.env.AUEVO_FEE_BPS ? Number(process.env.AUEVO_FEE_BPS) : DEFAULT_FEE_BPS;
    const feeRecipient = process.env.AUEVO_FEE_RECIPIENT as Address | undefined;
    const permitsByToken = body.permits ?? {};

    let attachedUsdgPermit = false;
    const legs: BasketLeg[] = rebalance.legs.map((leg) => {
      const permitKey = leg.side === "buy" ? USDG : leg.token;
      const raw = permitsByToken[permitKey];
      // At most one PERMIT2_PERMIT command per input token is needed — attach a buy leg's (shared) USDG permit only once.
      const skip = leg.side === "buy" && attachedUsdgPermit;
      if (leg.side === "buy" && raw && !skip) attachedUsdgPermit = true;
      return {
        quote: leg.quote,
        amountIn: leg.amountIn,
        amountOutMinimum: leg.amountOutMinimum,
        permit: raw && !skip ? (raw as unknown as BasketLeg["permit"]) : undefined,
      };
    });

    const built = buildBasketSwap({
      legs,
      recipient: body.recipient as Address,
      deadline: Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS,
      feeBps: feeRecipient ? feeBps : 0,
      feeRecipient: feeRecipient ?? ("0x0000000000000000000000000000000000000000" as Address),
    });

    return NextResponse.json({
      needed: true,
      driftBps: rebalance.driftBps,
      driftThresholdBps,
      to: built.to,
      data: built.data,
      value: built.value.toString(),
      legs: rebalance.legs.map((l) => ({
        ticker: l.ticker,
        token: l.token,
        side: l.side,
        amountIn: l.amountIn.toString(),
        amountOutMinimum: l.amountOutMinimum.toString(),
        protocol: l.quote.protocol,
      })),
      excluded: rebalance.excluded,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
