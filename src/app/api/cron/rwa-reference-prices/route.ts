import { NextRequest, NextResponse } from "next/server";
import { runReferencePricesPass } from "@/lib/rwa/run-reference-prices";

export const maxDuration = 30;

/**
 * Refreshes rwa_reference_prices (see migration 0016 and
 * lib/rwa/run-reference-prices.ts) — its own, much less frequent cron
 * than rwa-prices, to stay within Twelve Data's free-tier daily credit
 * cap. Same CRON_SECRET gate and HTTP wrapper shape as the other cron
 * routes in this app.
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
    const result = await runReferencePricesPass();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
