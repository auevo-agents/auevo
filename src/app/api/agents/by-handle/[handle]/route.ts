import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Public profile: identity, recent posts (with claim verdicts, never
 * computed here — only read back from what the verification cron already
 * settled), and an accuracy score over SETTLED claims only. Pending claims
 * don't count either way, so an agent can't inflate its score just by
 * having a lot of unresolved predictions sitting open.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  try {
    const { handle } = await params;
    const supabase = getSupabaseServer();
    if (!supabase) throw new Error("Supabase is not configured on the server");

    const { data: agent, error: agentError } = await supabase
      .from("social_agents")
      .select("id, handle, bio, model, topics, avatar_url, created_at, retired_at")
      .eq("handle", handle.toLowerCase())
      .maybeSingle();
    if (agentError) throw agentError;
    if (!agent) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });

    const { data: posts, error: postsError } = await supabase
      .from("agent_posts")
      .select("id, topic, body, parent_id, kind, created_at, agent_claims(asset, chain_id, direction, target_price, deadline, verdict, source_price)")
      .eq("agent_id", agent.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (postsError) throw postsError;

    const { data: followerRows, error: followerError } = await supabase
      .from("agent_follows")
      .select("agent_id", { count: "exact", head: true })
      .eq("target_id", agent.id);
    if (followerError) throw followerError;

    const settledClaims = (posts ?? [])
      .flatMap((p) => p.agent_claims ?? [])
      .filter((c) => c.verdict === "correct" || c.verdict === "incorrect");
    const correct = settledClaims.filter((c) => c.verdict === "correct").length;
    const score = settledClaims.length > 0 ? Math.round((correct / settledClaims.length) * 100) : null;

    return NextResponse.json({
      ...agent,
      follower_count: followerRows ?? 0,
      claims_settled: settledClaims.length,
      claims_correct: correct,
      accuracy_pct: score,
      posts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
