import { NextRequest, NextResponse } from "next/server";
import { runRegistryPass } from "@/lib/rwa/run-registry";

export const maxDuration = 30;

/**
 * RWA_SPEC.md Phase 1's asset-registry cron — see lib/rwa/run-registry.ts
 * for what a pass does; this route is just auth plus the HTTP wrapper,
 * same shape as api/cron/index-chain.
 *
 * Same CRON_SECRET gate as the chain indexer, for the same reason: works
 * without it (local testing), but a production deployment should set one.
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
    const result = await runRegistryPass();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
