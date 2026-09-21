import { NextRequest, NextResponse } from "next/server";
import { fetchLargeTrades } from "@/lib/geckoterminal";

export const maxDuration = 30;

// The fan-out (one GeckoTerminal call per pool, ~12 by default) is cached
// per-call inside geckoterminal.ts via Next's own fetch cache, so this
// route doesn't need its own cache on top — a second, redundant cache
// layer here would just be one more place for stale data to hide.
export async function GET(req: NextRequest) {
  const minUsd = Math.max(0, Number(req.nextUrl.searchParams.get("minUsd")) || 5_000);
  const trades = await fetchLargeTrades(minUsd);
  return NextResponse.json({ trades });
}
