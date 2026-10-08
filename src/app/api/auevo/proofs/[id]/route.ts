import { NextResponse } from "next/server";
import { getProofEvent } from "@/lib/auevo/db";

export const runtime = "nodejs";

/** One Proof, full evidence pointers and verification record — "VIEW PROOF → VERIFY INDEPENDENTLY" (design doc §15). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const proof = await getProofEvent(id);
    if (!proof) return NextResponse.json({ error: "Unknown proof id" }, { status: 404 });
    return NextResponse.json(proof);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
