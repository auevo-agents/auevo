import { NextResponse } from "next/server";
import { listFinancialLeagueCohorts } from "@/lib/auevo/db";

export const runtime = "nodejs";

/** Public, free, no-key — same convention as /api/credit/check. */
export async function GET() {
  try {
    const cohorts = await listFinancialLeagueCohorts();
    return NextResponse.json({ cohorts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
