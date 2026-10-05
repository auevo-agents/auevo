import { NextRequest, NextResponse } from "next/server";
import { settleDueVirtualPortfolios } from "@/lib/auevo/virtual-portfolio";

export const maxDuration = 30;

/**
 * Settles overdue virtual-portfolio runs against a real SPY price — see
 * virtual-portfolio.ts. Same CRON_SECRET gate as every other cron here.
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
    const result = await settleDueVirtualPortfolios();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
