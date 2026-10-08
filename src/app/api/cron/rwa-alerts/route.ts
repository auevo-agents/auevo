import { NextRequest, NextResponse } from "next/server";
import { runAlertsPass } from "@/lib/rwa/run-alerts";

export const maxDuration = 30;

/**
 * RWA_SPEC.md Phase 8's alert-evaluation cron — see run-alerts.ts for
 * what a pass does. Same CRON_SECRET gate as every other cron in this
 * app. Runs every 5 minutes (vercel.json) now that this project is on
 * the Pro plan — a Hobby plan rejects any cron more frequent than once a
 * day outright at deploy time (see run-prices.ts's own doc comment on
 * how that was discovered the hard way), which is why this used to run
 * once a day.
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
    const result = await runAlertsPass();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
