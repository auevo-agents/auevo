import { NextRequest, NextResponse } from "next/server";
import { settleDueFinancialLeagueCohorts } from "@/lib/auevo/settle-financial-league";

export const maxDuration = 30;

/** Settles overdue Financial Agent League cohorts — see settle-financial-league.ts. Same CRON_SECRET gate as every other cron in this app. */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await settleDueFinancialLeagueCohorts();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
