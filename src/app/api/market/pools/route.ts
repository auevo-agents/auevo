import { NextRequest, NextResponse } from "next/server";
import { fetchMarketPools } from "@/lib/geckoterminal";

export const maxDuration = 20;

export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab") === "radar" ? "radar" : "all";
  const defaultPages = tab === "radar" ? 2 : 5;
  const pages = Math.max(1, Math.min(10, Number(req.nextUrl.searchParams.get("pages")) || defaultPages));

  const pools = await fetchMarketPools(tab, pages);
  return NextResponse.json({ pools });
}
