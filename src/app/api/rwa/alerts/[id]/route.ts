import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getSupabaseServer } from "@/lib/supabase";

export const maxDuration = 15;

/** Unsubscribes — requires the same account that created the alert (checked, not signature-verified, same trust model as every other per-wallet write in this app: informational data, no funds at risk). */
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/rwa/alerts/[id]">) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const account = req.nextUrl.searchParams.get("account");
  if (!account || !isAddress(account, { strict: false })) {
    return NextResponse.json({ error: "account must be a valid address" }, { status: 400 });
  }

  const { data, error } = await supabase.from("alerts").delete().eq("id", id).eq("account", account.toLowerCase()).select("id");
  if (error) return NextResponse.json({ error: `Could not delete alert: ${error.message}` }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "Alert not found for this account" }, { status: 404 });

  return NextResponse.json({ deleted: true });
}
