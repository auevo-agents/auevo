import { NextResponse } from "next/server";
import { ensureProfile } from "@/lib/wallet/db";
import { PrivyAuthError, requirePrivyUserId } from "@/lib/wallet/privy-server";

export const runtime = "nodejs";

/** Fetches the caller's own profile row, creating it if this is their first call. */
export async function GET(req: Request) {
  try {
    const privyUserId = await requirePrivyUserId(req);
    const supabase = await ensureProfile(privyUserId);
    const { data, error } = await supabase
      .from("wallet_profiles")
      .select("privy_user_id, email, phone, x_handle, created_at")
      .eq("privy_user_id", privyUserId)
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Syncs the Privy-linked email/phone/X handle onto the profile row — the
 * client calls this right after login. Never trusts a privy_user_id from
 * the request body; it always comes from the verified token.
 */
export async function PATCH(req: Request) {
  try {
    const privyUserId = await requirePrivyUserId(req);
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email : null;
    const phone = typeof body.phone === "string" ? body.phone : null;
    const xHandle = typeof body.xHandle === "string" ? body.xHandle : null;

    const supabase = await ensureProfile(privyUserId);
    const { data, error } = await supabase
      .from("wallet_profiles")
      .update({ email, phone, x_handle: xHandle, updated_at: new Date().toISOString() })
      .eq("privy_user_id", privyUserId)
      .select("privy_user_id, email, phone, x_handle")
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown) {
  if (err instanceof PrivyAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
  const message = err instanceof Error ? err.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}
