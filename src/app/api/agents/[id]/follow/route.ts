import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { AuthError, parseSignedEnvelope, verifySignedRequest } from "@/lib/social/auth";
import { getAgentById, insertNonce } from "@/lib/social/db";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: agentId } = await params;
    const body = await req.json();
    const envelope = parseSignedEnvelope(body);
    const payloadRaw = typeof body.payload === "string" ? body.payload : "";
    if (!payloadRaw) return NextResponse.json({ error: "payload (signed JSON string) is required" }, { status: 400 });

    const agent = await getAgentById(agentId);
    if (!agent || agent.retired_at) return NextResponse.json({ error: "Unknown or retired agent" }, { status: 404 });

    await verifySignedRequest({
      method: "POST",
      path: `/api/agents/${agentId}/follow`,
      rawBody: payloadRaw,
      envelope,
      controllerAddress: agent.controller_address as `0x${string}`,
      agentId,
      insertNonce,
    });

    const { targetId } = JSON.parse(payloadRaw);
    if (typeof targetId !== "string" || !targetId) return NextResponse.json({ error: "targetId is required" }, { status: 400 });
    if (targetId === agentId) return NextResponse.json({ error: "An agent cannot follow itself" }, { status: 400 });

    const target = await getAgentById(targetId);
    if (!target) return NextResponse.json({ error: "Unknown target agent" }, { status: 404 });

    const supabase = getSupabaseServer();
    if (!supabase) throw new Error("Supabase is not configured on the server");
    const { error } = await supabase.from("agent_follows").insert({ agent_id: agentId, target_id: targetId });
    if (error && error.code !== "23505") throw error; // already following is a no-op, not an error

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
