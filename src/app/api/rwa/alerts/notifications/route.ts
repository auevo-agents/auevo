import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getSupabaseServer } from "@/lib/supabase";

export const maxDuration = 15;

const LIMIT = 50;

/**
 * The "web notifications" half of RWA_SPEC.md Phase 8's alerts — an
 * in-app feed a connected wallet can read, not a browser Push API
 * subscription (see 0009_rwa_alerts.sql's own note on why). Populated by
 * /api/cron/rwa-alerts (run-alerts.ts).
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ indexed: false, notifications: [] });

  const account = req.nextUrl.searchParams.get("account");
  if (!account || !isAddress(account, { strict: false })) {
    return NextResponse.json({ error: "account must be a valid address" }, { status: 400 });
  }

  const { data: alertIds, error: alertsError } = await supabase.from("alerts").select("id").eq("account", account.toLowerCase());
  if (alertsError) return NextResponse.json({ error: `Could not read alerts: ${alertsError.message}` }, { status: 500 });
  if (!alertIds || alertIds.length === 0) return NextResponse.json({ indexed: true, notifications: [] });

  const { data, error } = await supabase
    .from("alert_notifications")
    .select("id, alert_id, message, delivered_telegram, fired_at")
    .in(
      "alert_id",
      alertIds.map((a) => a.id)
    )
    .order("fired_at", { ascending: false })
    .limit(LIMIT);
  if (error) return NextResponse.json({ error: `Could not read alert_notifications: ${error.message}` }, { status: 500 });

  return NextResponse.json({ indexed: true, notifications: data ?? [] });
}
