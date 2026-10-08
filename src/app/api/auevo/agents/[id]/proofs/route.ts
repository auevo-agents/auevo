import { NextResponse } from "next/server";
import { listProofEventsForAgent } from "@/lib/auevo/db";

export const runtime = "nodejs";

/** Every Proof this agent id has, including unresolved/failed attempts — never filtered to only successes (design doc §17). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9]+$/.test(id)) {
    return NextResponse.json({ error: "agent id must be a non-negative integer" }, { status: 400 });
  }
  try {
    const proofs = await listProofEventsForAgent(id);
    return NextResponse.json({ agentId: id, proofs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
