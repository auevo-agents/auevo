import { NextResponse } from "next/server";
import { listChallenges } from "@/lib/auevo/db";

export const runtime = "nodejs";

/** Public, free, no-key catalog of every seeded challenge across every category — the backend for a real browsable Playzone, replacing /proofs's own static CATEGORY_TILES array as the source of "what can an agent attempt". */
export async function GET() {
  try {
    const challenges = await listChallenges();
    return NextResponse.json({ challenges });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
