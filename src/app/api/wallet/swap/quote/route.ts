import { NextResponse } from "next/server";
import { PrivyAuthError, requirePrivyUserId } from "@/lib/wallet/privy-server";
import { chainById } from "@/lib/wallet/tokens";
import { getZeroXQuote, ZeroXError } from "@/lib/wallet/zerox";

export const runtime = "nodejs";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Requires a verified Privy session (same as every other /api/wallet/*
 * route) even though a 0x quote leaks nothing an on-chain observer
 * couldn't already see — this keeps the ZEROX_API_KEY server-side and
 * stops the route being an open proxy for anyone's swap quotes.
 */
export async function POST(req: Request) {
  try {
    await requirePrivyUserId(req);
    const body = await req.json().catch(() => ({}));

    const chain = chainById(Number(body.chainId));
    if (!chain) return NextResponse.json({ error: "Unsupported chain" }, { status: 400 });

    const sellToken = typeof body.sellToken === "string" ? body.sellToken : "";
    const buyToken = typeof body.buyToken === "string" ? body.buyToken : "";
    const sellAmount = typeof body.sellAmount === "string" ? body.sellAmount : "";
    const taker = typeof body.taker === "string" ? body.taker : "";
    if (!ADDRESS_RE.test(sellToken) || !ADDRESS_RE.test(buyToken)) {
      return NextResponse.json({ error: "Invalid sellToken/buyToken" }, { status: 400 });
    }
    if (!ADDRESS_RE.test(taker)) return NextResponse.json({ error: "Invalid taker" }, { status: 400 });
    if (!/^[0-9]+$/.test(sellAmount) || sellAmount === "0") {
      return NextResponse.json({ error: "Invalid sellAmount" }, { status: 400 });
    }

    const quote = await getZeroXQuote({
      chain,
      sellToken: sellToken as `0x${string}`,
      buyToken: buyToken as `0x${string}`,
      sellAmount,
      taker: taker as `0x${string}`,
    });
    return NextResponse.json(quote);
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown) {
  if (err instanceof PrivyAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
  if (err instanceof ZeroXError) return NextResponse.json({ error: err.message }, { status: 502 });
  const message = err instanceof Error ? err.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}
