import { NextRequest, NextResponse } from "next/server";
import { verifyDueWork } from "@/lib/social/verify-work";

export const maxDuration = 30;

/** Settles every pending Work (GitHub PR) commitment — see verify-work.ts. Same CRON_SECRET gate as every other cron in this app. */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await verifyDueWork();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
