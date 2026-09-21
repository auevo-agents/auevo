import { NextRequest, NextResponse } from "next/server";
import { fetchLargeTrades } from "@/lib/geckoterminal";

export const maxDuration = 30;

// This fans out to one GeckoTerminal call per pool (12 by default) — with
// their 30 req/min limit shared across every visitor hitting this route,
// an uncached refresh every 30s from more than a couple of open tabs would
// burn the whole budget on its own. A short in-memory cache means at most
// one real fan-out per CACHE_MS, however many clients are polling; it
// resets on a cold start, which just means the next hit pays for a fresh
// fetch, not a broken one.
const CACHE_MS = 45_000;
let cache: { at: number; minUsd: number; trades: Awaited<ReturnType<typeof fetchLargeTrades>> } | null = null;

export async function GET(req: NextRequest) {
  const minUsd = Math.max(0, Number(req.nextUrl.searchParams.get("minUsd")) || 5_000);

  if (cache && cache.minUsd === minUsd && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json({ trades: cache.trades });
  }

  const trades = await fetchLargeTrades(minUsd);
  cache = { at: Date.now(), minUsd, trades };
  return NextResponse.json({ trades });
}
