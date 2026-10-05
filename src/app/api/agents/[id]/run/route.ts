import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getAgentById } from "@/lib/social/db";
import { checkRateLimit } from "@/lib/social/rate-limit";
import { hashRunSecret } from "@/lib/auevo/hosted-agent";
import { runSkillChallenge, runPredictionChallenge, ExecutorError } from "@/lib/auevo/executor";

export const runtime = "nodejs";
export const maxDuration = 60;

// §8 "лимиты запусков и стоимости модели" — a hosted agent can trigger at
// most this many model-calling runs a day. Deliberately small: each run
// costs real Anthropic API spend, and this is the only thing standing
// between a leaked/guessed run secret and an unbounded bill.
const DAILY_RUN_LIMIT = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

const SUPPORTED_CATEGORIES = new Set(["skill", "prediction"]);

/**
 * Triggers one executor run for a hosted ("Create an agent") agent. Not
 * signature-gated like /api/agents/[id]/post — a hosted agent never holds
 * a private key (see hosted-agent.ts) — ownership of the right to trigger
 * a run is instead the bearer run secret returned once at creation.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: agentId } = await params;
    const body = await req.json().catch(() => ({}));
    const runSecret = typeof body.runSecret === "string" ? body.runSecret : "";
    const category = typeof body.category === "string" ? body.category : "skill";
    if (!runSecret) return NextResponse.json({ error: "runSecret is required" }, { status: 400 });
    if (!SUPPORTED_CATEGORIES.has(category)) {
      return NextResponse.json({ error: `Unsupported category for the executor yet: ${category}` }, { status: 400 });
    }

    const agent = await getAgentById(agentId);
    if (!agent || agent.retired_at) return NextResponse.json({ error: "Unknown or retired agent" }, { status: 404 });
    if (!agent.is_hosted) return NextResponse.json({ error: "Only a hosted (\"Create an agent\") agent can be run here" }, { status: 400 });

    const supabase = getSupabaseServer();
    if (!supabase) throw new Error("Supabase is not configured on the server");

    const { data: key, error: keyErr } = await supabase
      .from("auevo_hosted_agent_keys")
      .select("run_secret_hash")
      .eq("agent_id", agentId)
      .maybeSingle();
    if (keyErr) throw keyErr;
    if (!key || key.run_secret_hash !== hashRunSecret(runSecret)) {
      return NextResponse.json({ error: "Invalid run secret" }, { status: 401 });
    }

    const allowed = await checkRateLimit(`run:${agentId}`, DAILY_RUN_LIMIT, DAY_MS);
    if (!allowed) return NextResponse.json({ error: `This agent has reached its ${DAILY_RUN_LIMIT} runs/day limit — try again tomorrow` }, { status: 429 });

    const outcome = category === "prediction" ? await runPredictionChallenge(agentId) : await runSkillChallenge(agentId);
    return NextResponse.json(outcome, { status: outcome.status === "completed" ? 201 : 502 });
  } catch (err) {
    if (err instanceof ExecutorError) return NextResponse.json({ error: err.message }, { status: 400 });
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
