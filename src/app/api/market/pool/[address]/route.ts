import { NextResponse } from "next/server";
import { fetchMarketPool } from "@/lib/geckoterminal";

export const maxDuration = 15;

export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/market/pool/[address]">
) {
  const { address } = await ctx.params;
  const pool = await fetchMarketPool(address);

  if (!pool) {
    return NextResponse.json({ error: "Pool not found" }, { status: 404 });
  }
  return NextResponse.json({ pool });
}
