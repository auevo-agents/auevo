import { NextResponse } from "next/server";
import { ensureProfile } from "@/lib/wallet/db";
import { PrivyAuthError, requirePrivyUserId } from "@/lib/wallet/privy-server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const privyUserId = await requirePrivyUserId(req);
    const supabase = await ensureProfile(privyUserId);
    const { data, error } = await supabase
      .from("wallet_chats")
      .select("id, agent_id, title, created_at, updated_at")
      .eq("privy_user_id", privyUserId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const privyUserId = await requirePrivyUserId(req);
    const body = await req.json().catch(() => ({}));
    const agentId = typeof body.agentId === "string" ? body.agentId : null;
    const title = typeof body.title === "string" ? body.title : null;

    const supabase = await ensureProfile(privyUserId);
    const { data, error } = await supabase
      .from("wallet_chats")
      .insert({ privy_user_id: privyUserId, agent_id: agentId, title })
      .select("id, agent_id, title, created_at, updated_at")
      .single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown) {
  if (err instanceof PrivyAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
  const message = err instanceof Error ? err.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}
