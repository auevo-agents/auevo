import { NextRequest, NextResponse } from "next/server";
import { fetchOhlcv, type OhlcvTimeframe } from "@/lib/geckoterminal";

export const maxDuration = 15;

const TIMEFRAMES: OhlcvTimeframe[] = ["minute", "hour", "day"];

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/market/ohlcv/[address]">
) {
  const { address } = await ctx.params;

  const timeframeParam = req.nextUrl.searchParams.get("timeframe");
  const timeframe: OhlcvTimeframe = TIMEFRAMES.includes(timeframeParam as OhlcvTimeframe)
    ? (timeframeParam as OhlcvTimeframe)
    : "hour";
  const aggregate = Math.max(1, Number(req.nextUrl.searchParams.get("aggregate")) || 1);

  const candles = await fetchOhlcv(address, timeframe, aggregate, 300);
  return NextResponse.json({ candles });
}
