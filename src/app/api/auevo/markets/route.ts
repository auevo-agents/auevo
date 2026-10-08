import { NextResponse } from "next/server";
import { listOpenMarkets } from "@/lib/auevo/db";

export const runtime = "nodejs";

/** Public, free, no-key catalog of open Polymarket markets cached in auevo_markets — same convention as /api/auevo/challenges/financial-league. Used by the Prediction "Live markets" panel. */
export async function GET() {
  try {
    const markets = await listOpenMarkets(24);
    return NextResponse.json({ markets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
