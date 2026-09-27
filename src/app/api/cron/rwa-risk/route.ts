import { NextRequest, NextResponse } from "next/server";
import { runRiskPass } from "@/lib/rwa/run-risk";

// Was 30 — a real production run (2026-09-27) hit Vercel's own
// FUNCTION_INVOCATION_TIMEOUT at exactly that ceiling once rwa_tokens grew
// past ~350 rows (more stale tokens queued up per run than before). 60 is
// the same Hobby-plan ceiling api/cron/index-chain already uses.
export const maxDuration = 60;

/**
 * RWA_SPEC.md Phase 5's risk-scoring cron — see lib/rwa/run-risk.ts for
 * what a pass scans and how it paces itself. Same CRON_SECRET gate and
 * HTTP wrapper shape as this app's other cron routes.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await runRiskPass();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
