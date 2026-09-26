import { NextRequest, NextResponse } from "next/server";
import { runPricesPass } from "@/lib/rwa/run-prices";

export const maxDuration = 30;

/**
 * RWA_SPEC.md Phase 1's price/liquidity cron — see
 * lib/rwa/run-prices.ts for what a pass does and why it currently only
 * fills in price (not liquidity/volume). Same CRON_SECRET gate and HTTP
 * wrapper shape as the other cron routes in this app.
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
    const result = await runPricesPass();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
