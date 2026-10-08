import { NextResponse } from "next/server";
import { listRecentProofEvents } from "@/lib/auevo/db";

export const runtime = "nodejs";

/**
 * Backs the "Live proof feed" panel's polling (src/app/proofs/live-proof-feed.tsx)
 * — the same listRecentProofEvents() the server-rendered /proofs page
 * itself seeds from, just callable from the client so the panel can pick
 * up a genuinely new row without a full page reload.
 */
export async function GET(req: Request) {
  try {
    const limit = Math.min(20, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 8));
    const proofs = await listRecentProofEvents(limit);
    return NextResponse.json({ proofs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
