import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { PrivyAuthError, requirePrivyUserId } from "@/lib/wallet/privy-server";

export const runtime = "nodejs";

/** Permanently deletes one chat owned by the signed-in Privy user. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const privyUserId = await requirePrivyUserId(req);
    const supabase = getSupabaseServer();
    if (!supabase) throw new Error("Supabase is not configured on the server");

    const { data, error } = await supabase
      .from("wallet_chats")
      .delete()
      .eq("id", id)
      .eq("privy_user_id", privyUserId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof PrivyAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
