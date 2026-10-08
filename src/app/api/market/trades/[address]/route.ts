import { NextRequest, NextResponse } from "next/server";
import { fetchMarketPool, fetchPoolTrades } from "@/lib/geckoterminal";

export const maxDuration = 15;

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/market/trades/[address]">
) {
  const { address } = await ctx.params;
  const minUsd = Math.max(0, Number(req.nextUrl.searchParams.get("minUsd")) || 0);

  const pool = await fetchMarketPool(address);
  if (!pool) {
    return NextResponse.json({ error: "Pool not found" }, { status: 404 });
  }

  const trades = await fetchPoolTrades(address, pool.baseToken, pool.quoteToken, minUsd);
  return NextResponse.json({ trades });
}
