import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { PrivyAuthError, requirePrivyUserId } from "@/lib/wallet/privy-server";

export const runtime = "nodejs";

/** Lists a chat's messages, oldest first — scoped to the caller's own chat. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const privyUserId = await requirePrivyUserId(req);
    const supabase = getSupabaseServer();
    if (!supabase) throw new Error("Supabase is not configured on the server");

    const { data: chat, error: chatErr } = await supabase
      .from("wallet_chats")
      .select("id")
      .eq("id", id)
      .eq("privy_user_id", privyUserId)
      .maybeSingle();
    if (chatErr) throw chatErr;
    if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

    const { data, error } = await supabase
      .from("wallet_messages")
      .select("id, role, content, created_at")
      .eq("chat_id", id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof PrivyAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
