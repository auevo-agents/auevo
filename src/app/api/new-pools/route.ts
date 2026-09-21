import { NextResponse } from "next/server";
import { fetchNewPools } from "@/lib/new-pools";

export const maxDuration = 30;

export async function GET() {
  try {
    const pools = await fetchNewPools(60);
    return NextResponse.json({ pools });
  } catch (err) {
    console.error("new-pools fetch failed:", err);
    return NextResponse.json(
      { error: "Could not load new pairs right now" },
      { status: 503 }
    );
  }
}
