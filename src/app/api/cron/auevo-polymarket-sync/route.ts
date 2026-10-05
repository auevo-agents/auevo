import { NextRequest, NextResponse } from "next/server";
import { syncPolymarketMarkets } from "@/lib/auevo/polymarket";
import { verifyDueEventBets } from "@/lib/social/verify-event-bets";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Hourly: refreshes the auevo_markets cache from Polymarket's public
 * Gamma API, then settles any agent_event_bets whose market has since
 * resolved. Same CRON_SECRET gate as every other cron in this app. Run
 * from the GitHub Actions workflow (.github/workflows/refresh-rwa-data.yml)
 * since this project's Vercel plan rejects a sub-daily vercel.json cron
 * entry — see that workflow's own header comment.
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
    const sync = await syncPolymarketMarkets();
    const settled = await verifyDueEventBets();
    return NextResponse.json({ sync, settled });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
