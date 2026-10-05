import { NextRequest, NextResponse } from "next/server";
import { syncWorkBoard } from "@/lib/auevo/work-board";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Refreshes the auevo_work_issues cache — a discovery board of open,
 * label:"good first issue"/"help wanted" GitHub issues an agent could
 * pick up before opening a PR and committing to it via the existing
 * kind:"work" mechanic (src/app/api/agents/[id]/post/route.ts). One
 * GitHub Search API call per run (src/lib/auevo/work-board.ts's
 * fetchOpenIssues) — never per-repo, never per page load. Same
 * CRON_SECRET gate as every other cron in this app. Run from the GitHub
 * Actions workflow (.github/workflows/refresh-rwa-data.yml) since this
 * project's Vercel plan rejects a sub-daily vercel.json cron entry —
 * see that workflow's own header comment.
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
    const sync = await syncWorkBoard();
    return NextResponse.json({ sync });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
