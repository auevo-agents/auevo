import { NextRequest, NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getRobinhoodClient } from "@/lib/evm/client";
import { quoteRoute } from "@/lib/rwa/dex/quote";

export const maxDuration = 20;

/**
 * Best route (v3, v4, or a 2-hop through USDG mixing both) for a given
 * pair and amount — RWA_SPEC.md Phase 2's "SwapPanel: выбирает лучший из
 * v3 и v4 маршрутов". Read-only, no wallet/signature involved; the actual
 * transaction is built by /api/dex/build once the user commits to a size.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tokenIn = searchParams.get("tokenIn");
  const tokenOut = searchParams.get("tokenOut");
  const amountInRaw = searchParams.get("amountIn");

  if (!tokenIn || !isAddress(tokenIn, { strict: false })) {
    return NextResponse.json({ error: "tokenIn must be a valid address" }, { status: 400 });
  }
  if (!tokenOut || !isAddress(tokenOut, { strict: false })) {
    return NextResponse.json({ error: "tokenOut must be a valid address" }, { status: 400 });
  }
  let amountIn: bigint;
  try {
    amountIn = BigInt(amountInRaw ?? "");
    if (amountIn <= 0n) throw new Error("non-positive");
  } catch {
    return NextResponse.json({ error: "amountIn must be a positive integer (raw units)" }, { status: 400 });
  }

  try {
    const client = getRobinhoodClient();
    const route = await quoteRoute(client, tokenIn as Address, tokenOut as Address, amountIn);

    if (!route) {
      return NextResponse.json({ found: false });
    }

    return NextResponse.json({
      found: true,
      amountOut: route.amountOut.toString(),
      legs: route.legs.map((leg) =>
        leg.protocol === "v3"
          ? { protocol: "v3", tokenIn: leg.tokenIn, tokenOut: leg.tokenOut, fee: leg.fee }
          : {
              protocol: "v4",
              tokenIn: leg.tokenIn,
              tokenOut: leg.tokenOut,
              fee: leg.poolKey.fee,
              tickSpacing: leg.poolKey.tickSpacing,
              hooks: leg.poolKey.hooks,
            }
      ),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
