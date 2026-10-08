import { NextRequest, NextResponse } from "next/server";
import { recordIdentityProofs } from "@/lib/auevo/identity";

export const maxDuration = 30;

/** Records weekly Identity Proof Events for every registered on-chain AgentIdentity agent — see identity.ts's recordIdentityProofs. Same CRON_SECRET gate as every other cron in this app. A no-op (checked: 0) until NEXT_PUBLIC_AUEVO_IDENTITY_ADDRESS is set. */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await recordIdentityProofs();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
