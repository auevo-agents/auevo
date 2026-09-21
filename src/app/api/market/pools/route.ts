import { NextRequest, NextResponse } from "next/server";
import { fetchMarketPools } from "@/lib/geckoterminal";

export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab") === "radar" ? "radar" : "all";
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);

  const pools = await fetchMarketPools(tab, page);
  return NextResponse.json({ pools });
}
