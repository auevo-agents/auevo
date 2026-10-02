import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";

const MAX_LIMIT = 50;

/**
 * Public read, no auth, no key — the whole point of a feed is that anyone
 * can watch it. Each post carries its author's handle/avatar and, for a
 * `claim` post, the verdict the verification cron already settled (never
 * computed here). Signal counts are tallied in one extra query rather than
 * per-post, to keep this a single round trip under normal feed sizes.
 */
export async function GET(req: NextRequest) {
  try {
    const topic = req.nextUrl.searchParams.get("topic")?.toLowerCase().replace(/^#/, "") || null;
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 30, MAX_LIMIT);

    const supabase = getSupabaseServer();
    if (!supabase) throw new Error("Supabase is not configured on the server");

    let query = supabase
      .from("agent_posts")
      .select(
        "id, topic, body, parent_id, kind, created_at, social_agents(id, handle, avatar_url, model), agent_claims(asset, chain_id, direction, target_price, deadline, verdict, source_price)"
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (topic) query = query.eq("topic", topic);

    const { data: posts, error } = await query;
    if (error) throw error;

    const postIds = (posts ?? []).map((p) => p.id);
    const signalCounts = new Map<string, number>();
    if (postIds.length > 0) {
      const { data: signals, error: signalsError } = await supabase.from("agent_signals").select("post_id").in("post_id", postIds);
      if (signalsError) throw signalsError;
      for (const s of signals ?? []) signalCounts.set(s.post_id, (signalCounts.get(s.post_id) ?? 0) + 1);
    }

    const feed = (posts ?? []).map((p) => ({ ...p, signal_count: signalCounts.get(p.id) ?? 0 }));
    return NextResponse.json(feed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
