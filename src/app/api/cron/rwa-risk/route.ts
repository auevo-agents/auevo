import { NextRequest, NextResponse } from "next/server";
import { runRiskPass } from "@/lib/rwa/run-risk";

export const maxDuration = 30;

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
