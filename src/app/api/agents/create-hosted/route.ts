import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/social/rate-limit";
import { generateHostedControllerAddress, generateRunSecret, hashRunSecret } from "@/lib/auevo/hosted-agent";
import { EXECUTOR_ALLOWED_MODELS } from "@/lib/auevo/executor-models";

export const runtime = "nodejs";

const HANDLE_RE = /^[a-z0-9_]{3,32}$/;

/**
 * "Create an agent" (execution-plan doc §1) — the counterpart to
 * /api/agents/register's wallet-signed "Connect your agent" path. No
 * wallet, no signature: the browser gets back a run secret instead,
 * which is the only thing that proves it may later trigger this agent's
 * executor runs (see /api/agents/[id]/run). The profile this creates is
 * NOT yet a working agent — nothing has called a model for it — the UI
 * must keep saying so until its first run completes (doc §1's own
 * "создание профиля и создание работающего AI-агента — разные состояния").
 */
export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const allowed = await checkRateLimit(`create-hosted:${ip}`, 10, 60 * 60 * 1000);
    if (!allowed) return NextResponse.json({ error: "Too many agents created from this address, try later" }, { status: 429 });

    const body = await req.json();
    const handle = typeof body.handle === "string" ? body.handle.toLowerCase().replace(/^#/, "") : "";
    const bio = typeof body.bio === "string" ? body.bio.slice(0, 280) : "";
    const requestedModel = typeof body.model === "string" ? body.model : "";
    const model = (EXECUTOR_ALLOWED_MODELS as readonly string[]).includes(requestedModel) ? requestedModel : EXECUTOR_ALLOWED_MODELS[0];
    const topics = Array.isArray(body.topics) ? body.topics.filter((t: unknown) => typeof t === "string").slice(0, 10) : [];
    const avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl : null;

    if (!HANDLE_RE.test(handle)) return NextResponse.json({ error: "handle must be 3-32 chars of [a-z0-9_]" }, { status: 400 });

    const supabase = getSupabaseServer();
    if (!supabase) throw new Error("Supabase is not configured on the server");

    const controllerAddress = generateHostedControllerAddress();
    const { data: agent, error } = await supabase
      .from("social_agents")
      .insert({ handle, controller_address: controllerAddress, bio, model, topics, avatar_url: avatarUrl, is_hosted: true })
      .select("id, handle, bio, model, topics, avatar_url, created_at")
      .single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "Handle already taken" }, { status: 409 });
      throw error;
    }

    const runSecret = generateRunSecret();
    const { error: keyError } = await supabase
      .from("auevo_hosted_agent_keys")
      .insert({ agent_id: agent.id, run_secret_hash: hashRunSecret(runSecret) });
    if (keyError) {
      await supabase.from("social_agents").delete().eq("id", agent.id);
      throw keyError;
    }

    // runSecret is returned exactly once — only its hash is ever stored.
    return NextResponse.json({ ...agent, runSecret }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
