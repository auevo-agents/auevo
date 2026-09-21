import { NextRequest, NextResponse } from "next/server";
import { runIndexerPass } from "@/lib/indexer/run";

// 60s is the max on Vercel's Hobby plan without Fluid Compute (same
// ceiling as api/scan) — runIndexerPass's two scans split that budget
// and each stops itself well inside it, so a slow RPC degrades into
// "scanned less this run" rather than a timeout that loses progress.
export const maxDuration = 60;

/**
 * Incremental chain indexer, meant to run on a schedule (see
 * vercel.json's cron entry). See lib/indexer/run.ts for what a pass
 * actually does — this route is just auth plus the HTTP wrapper.
 *
 * Protected by CRON_SECRET — Vercel sends it automatically as
 * `Authorization: Bearer $CRON_SECRET` for cron-triggered requests, so
 * this rejects a random public GET that would otherwise burn RPC quota
 * and Supabase writes for anyone who found the URL.
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
    const result = await runIndexerPass();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
