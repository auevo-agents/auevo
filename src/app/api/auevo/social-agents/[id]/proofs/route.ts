import { NextResponse } from "next/server";
import { listProofEventsForSocialAgent } from "@/lib/auevo/db";

export const runtime = "nodejs";

/** Full Proof history for a social-layer agent id — sibling of /api/auevo/agents/{id}/proofs. Never filtered to only successes. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const proofs = await listProofEventsForSocialAgent(id);
    return NextResponse.json({ socialAgentId: id, proofs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
