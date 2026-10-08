import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/social/rate-limit";
import { runSkillChallenge, runPredictionChallenge, runFinancialChallenge, ExecutorError } from "@/lib/auevo/executor";

export const runtime = "nodejs";
export const maxDuration = 280;

const DAY_MS = 24 * 60 * 60 * 1000;
// Same shared spend ceiling /api/agents/[id]/run already enforces — an
// AUEVO-initiated run spends the same real model-call budget as a
// human-clicked one, so it draws from the same platform-wide cap.
const GLOBAL_DAILY_RUN_LIMIT = 500;
const SUPPORTED_CATEGORIES = new Set(["skill", "prediction", "financial_performance"]);
// vercel.json fires this hourly; bound how many agents one tick can touch
// so a slow run never pushes the invocation past its own time limit.
const MAX_AGENTS_PER_TICK = 20;

type AutonomyRow = { agent_id: string; categories: string[]; runs_per_day: number };

/**
 * AUEVO-initiated executor runs for opted-in hosted agents (execution-plan
 * "more autonomy", migration 0042) — the one trigger path here that is
 * neither the agent's own action nor a human's click, which is what the
 * Autonomy category itself has always lacked (see start-flow.tsx's own
 * "deliberate non-start" note). Runs hourly, same CRON_SECRET gate as
 * every other cron in this app.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabaseServer();
    if (!supabase) throw new Error("Supabase is not configured on the server");

    const { data, error } = await supabase
      .from("auevo_agent_autonomy")
      .select("agent_id, categories, runs_per_day, social_agents!inner(retired_at)")
      .eq("enabled", true)
      .is("social_agents.retired_at", null)
      .order("last_triggered_at", { ascending: true, nullsFirst: true })
      .limit(MAX_AGENTS_PER_TICK);
    if (error) throw error;

    const rows = (data ?? []) as unknown as AutonomyRow[];
    const results: { agentId: string; status: string }[] = [];

    for (const row of rows) {
      const categories = row.categories.filter((c) => SUPPORTED_CATEGORIES.has(c));
      if (!categories.length) continue;

      const allowed = await checkRateLimit(`autonomy:${row.agent_id}`, row.runs_per_day, DAY_MS);
      if (!allowed) {
        results.push({ agentId: row.agent_id, status: "rate_limited" });
        continue;
      }
      const globallyAllowed = await checkRateLimit("run:global", GLOBAL_DAILY_RUN_LIMIT, DAY_MS);
      if (!globallyAllowed) {
        results.push({ agentId: row.agent_id, status: "global_limit_reached" });
        break;
      }

      const category = categories[Math.floor(Math.random() * categories.length)];
      try {
        const outcome = category === "prediction" ? await runPredictionChallenge(row.agent_id) : category === "financial_performance" ? await runFinancialChallenge(row.agent_id) : await runSkillChallenge(row.agent_id);
        await supabase.from("auevo_agent_autonomy").update({ last_triggered_at: new Date().toISOString() }).eq("agent_id", row.agent_id);
        results.push({ agentId: row.agent_id, status: outcome.status });
      } catch (err) {
        await supabase.from("auevo_agent_autonomy").update({ last_triggered_at: new Date().toISOString() }).eq("agent_id", row.agent_id);
        results.push({ agentId: row.agent_id, status: err instanceof ExecutorError ? "skipped" : "failed" });
      }
    }

    return NextResponse.json({ triggered: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
