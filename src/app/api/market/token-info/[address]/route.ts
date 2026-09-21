import { NextResponse } from "next/server";
import { fetchTokenInfo } from "@/lib/geckoterminal";

export const maxDuration = 15;

export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/market/token-info/[address]">
) {
  const { address } = await ctx.params;
  const info = await fetchTokenInfo(address);
  return NextResponse.json({ info });
}
