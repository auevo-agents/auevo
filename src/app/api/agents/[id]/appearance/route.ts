import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getAgentById, insertNonce } from "@/lib/social/db";
import { AuthError, parseSignedEnvelope, verifySignedRequest } from "@/lib/social/auth";
import { hashRunSecret } from "@/lib/auevo/hosted-agent";
import { isEntityKind } from "@/app/agents/garden/entity-catalog";

export const runtime = "nodejs";

/**
 * Saves the owner-chosen cosmetic forest-garden appearance (entity_kind)
 * for a social_agents row — never the Proof ledger, never reputation.
 * Same two owner-authentication paths every other agent-owner action in
 * this codebase already uses: a hosted ("Create an agent") agent has no
 * private key, so it authenticates with its bearer run secret (same check
 * as /api/agents/[id]/run); a wallet-controlled ("Connect your agent")
 * agent signs a request envelope over its chosen body, same scheme as
 * /api/agents/[id]/post.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: agentId } = await params;
    const agent = await getAgentById(agentId);
    if (!agent || agent.retired_at) return NextResponse.json({ error: "Unknown or retired agent" }, { status: 404 });

    const supabase = getSupabaseServer();
    if (!supabase) throw new Error("Supabase is not configured on the server");

    const body = await req.json().catch(() => ({}));
    let entityKind: unknown;

    if (agent.is_hosted) {
      const runSecret = typeof body.runSecret === "string" ? body.runSecret : "";
      if (!runSecret) return NextResponse.json({ error: "runSecret is required" }, { status: 400 });
      const { data: key, error: keyErr } = await supabase
        .from("auevo_hosted_agent_keys")
        .select("run_secret_hash")
        .eq("agent_id", agentId)
        .maybeSingle();
      if (keyErr) throw keyErr;
      if (!key || key.run_secret_hash !== hashRunSecret(runSecret)) {
        return NextResponse.json({ error: "Invalid run secret" }, { status: 401 });
      }
      entityKind = body.entityKind;
    } else {
      const envelope = parseSignedEnvelope(body);
      const payloadRaw = typeof body.payload === "string" ? body.payload : "";
      if (!payloadRaw) return NextResponse.json({ error: "payload (signed JSON string) is required" }, { status: 400 });
      await verifySignedRequest({
        method: "PATCH",
        path: `/api/agents/${agentId}/appearance`,
        rawBody: payloadRaw,
        envelope,
        controllerAddress: agent.controller_address as `0x${string}`,
        agentId,
        insertNonce,
      });
      const payload = JSON.parse(payloadRaw);
      entityKind = payload.entityKind;
    }

    if (!isEntityKind(entityKind)) {
      return NextResponse.json({ error: "entityKind must be one of the catalog ids" }, { status: 400 });
    }

    const { error } = await supabase.from("social_agents").update({ entity_kind: entityKind }).eq("id", agentId);
    if (error) throw error;

    return NextResponse.json({ id: agentId, entityKind });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
