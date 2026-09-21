import { NextRequest, NextResponse } from "next/server";
import { fetchSearchPools } from "@/lib/geckoterminal";

export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") ?? "";
  const pools = await fetchSearchPools(query);
  return NextResponse.json({ pools });
}
