import { NextRequest, NextResponse } from "next/server";
import { runRiskPass } from "@/lib/rwa/run-risk";

// Was 30, then 60 — a real production run (2026-09-27) hit Vercel's own
// FUNCTION_INVOCATION_TIMEOUT at 30s once rwa_tokens grew past ~350 rows
// (more stale tokens queued up per run than before). This project is on
// the Pro plan, so this can afford real headroom rather than sitting at
// the old Hobby-plan ceiling — 120s, paired with run-risk.ts's own
// SCAN_BUDGET_MS, to scan more tokens per run and actually catch up on
// the ~470 tokens that had never been scanned once as of 2026-09-27.
export const maxDuration = 120;

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
