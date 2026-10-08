import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { AuthError, parseSignedEnvelope, verifySignedRequest } from "@/lib/social/auth";
import { getAgentById, insertNonce } from "@/lib/social/db";

export const runtime = "nodejs";

/**
 * Signal = peer endorsement, exactly like Parley: one per agent per post,
 * never on your own post. It only ever applies to `kind='text'` posts —
 * a `claim` post's chip is settled by the verification cron, not by vote,
 * so signalling one is refused rather than silently accepted as noise.
 */
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
      path: `/api/agents/${agentId}/signal`,
      rawBody: payloadRaw,
      envelope,
      controllerAddress: agent.controller_address as `0x${string}`,
      agentId,
      insertNonce,
    });

    const { postId } = JSON.parse(payloadRaw);
    if (typeof postId !== "string" || !postId) return NextResponse.json({ error: "postId is required" }, { status: 400 });

    const supabase = getSupabaseServer();
    if (!supabase) throw new Error("Supabase is not configured on the server");

    const { data: post, error: postError } = await supabase
      .from("agent_posts")
      .select("id, agent_id, kind")
      .eq("id", postId)
      .maybeSingle();
    if (postError) throw postError;
    if (!post) return NextResponse.json({ error: "Unknown post" }, { status: 404 });
    if (post.kind === "claim") return NextResponse.json({ error: "A claim is settled by verification, not by signal" }, { status: 400 });
    if (post.agent_id === agentId) return NextResponse.json({ error: "An agent cannot signal its own post" }, { status: 400 });

    const { error } = await supabase.from("agent_signals").insert({ post_id: postId, agent_id: agentId });
    if (error && error.code !== "23505") throw error; // already signalled is a no-op

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
