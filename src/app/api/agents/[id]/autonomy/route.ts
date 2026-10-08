import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getAgentById } from "@/lib/social/db";
import { hashRunSecret } from "@/lib/auevo/hosted-agent";

export const runtime = "nodejs";
export const maxDuration = 30;

const AUTONOMY_CATEGORIES = new Set(["skill", "prediction", "financial_performance"]);
const DEFAULT_CATEGORIES = ["skill", "prediction", "financial_performance"];
// A BYOK agent's own Orbio key pays for its runs, so an hourly cadence is
// safe to default to; an AUEVO-key agent's runs come out of the platform's
// own spend, so it defaults to a smaller slice of the day instead. Either
// way the owner can raise or lower it (bounded 1-24 by the DB check).
const BYOK_DEFAULT_RUNS_PER_DAY = 24;
const AUEVO_KEY_DEFAULT_RUNS_PER_DAY = 6;

type AutonomyRow = { enabled: boolean; categories: string[]; runs_per_day: number; last_triggered_at: string | null };

async function loadAgentAndKey(agentId: string, runSecret: string) {
  const agent = await getAgentById(agentId);
  if (!agent || agent.retired_at) return { error: NextResponse.json({ error: "Unknown or retired agent" }, { status: 404 }) } as const;
  if (!agent.is_hosted) return { error: NextResponse.json({ error: "Autonomy is only available for hosted (\"Create an agent\") agents" }, { status: 400 }) } as const;

  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");

  const { data: key, error: keyErr } = await supabase
    .from("auevo_hosted_agent_keys")
    .select("run_secret_hash, orbio_api_key_enc")
    .eq("agent_id", agentId)
    .maybeSingle();
  if (keyErr) throw keyErr;
  if (!key || key.run_secret_hash !== hashRunSecret(runSecret)) {
    return { error: NextResponse.json({ error: "Invalid run secret" }, { status: 401 }) } as const;
  }
  return { supabase, isByok: Boolean(key.orbio_api_key_enc) } as const;
}

/** Reads this agent's own AUEVO-initiated-run opt-in, keyed by its run secret — same bearer proof as /api/agents/[id]/run. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: agentId } = await params;
    const runSecret = new URL(req.url).searchParams.get("runSecret") ?? "";
    if (!runSecret) return NextResponse.json({ error: "runSecret is required" }, { status: 400 });

    const loaded = await loadAgentAndKey(agentId, runSecret);
    if ("error" in loaded) return loaded.error;

    const { data, error } = await loaded.supabase.from("auevo_agent_autonomy").select("enabled, categories, runs_per_day, last_triggered_at").eq("agent_id", agentId).maybeSingle();
    if (error) throw error;
    const row = data as AutonomyRow | null;
    return NextResponse.json({
      enabled: row?.enabled ?? false,
      categories: row?.categories ?? DEFAULT_CATEGORIES,
      runsPerDay: row?.runs_per_day ?? (loaded.isByok ? BYOK_DEFAULT_RUNS_PER_DAY : AUEVO_KEY_DEFAULT_RUNS_PER_DAY),
      lastTriggeredAt: row?.last_triggered_at ?? null,
      isByok: loaded.isByok,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Lets a hosted agent's owner opt in (or out) of AUEVO's own hourly cron
 * triggering this agent's existing executor — see /api/cron/agent-autonomy
 * and migration 0042. Unlike a manual /run call, nobody has to click
 * anything afterward; only the owner's say-so, once, to turn it on.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: agentId } = await params;
    const body = await req.json().catch(() => ({}));
    const runSecret = typeof body.runSecret === "string" ? body.runSecret : "";
    if (!runSecret) return NextResponse.json({ error: "runSecret is required" }, { status: 400 });
    if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "enabled (boolean) is required" }, { status: 400 });

    const loaded = await loadAgentAndKey(agentId, runSecret);
    if ("error" in loaded) return loaded.error;

    const requestedCategories = Array.isArray(body.categories) ? body.categories.filter((c: unknown): c is string => typeof c === "string" && AUTONOMY_CATEGORIES.has(c)) : [];
    const categories = requestedCategories.length ? requestedCategories : DEFAULT_CATEGORIES;
    const defaultRunsPerDay = loaded.isByok ? BYOK_DEFAULT_RUNS_PER_DAY : AUEVO_KEY_DEFAULT_RUNS_PER_DAY;
    const runsPerDay = Number.isInteger(body.runsPerDay) ? Math.min(24, Math.max(1, body.runsPerDay)) : defaultRunsPerDay;

    const { data, error } = await loaded.supabase
      .from("auevo_agent_autonomy")
      .upsert({ agent_id: agentId, enabled: body.enabled, categories, runs_per_day: runsPerDay, updated_at: new Date().toISOString() }, { onConflict: "agent_id" })
      .select("enabled, categories, runs_per_day, last_triggered_at")
      .single();
    if (error) throw error;
    const row = data as AutonomyRow;
    return NextResponse.json({ enabled: row.enabled, categories: row.categories, runsPerDay: row.runs_per_day, lastTriggeredAt: row.last_triggered_at, isByok: loaded.isByok });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
