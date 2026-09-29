import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { PrivyAuthError, requirePrivyUserId } from "@/lib/wallet/privy-server";

export const runtime = "nodejs";

/**
 * Every query here filters on BOTH id and privy_user_id — not id alone.
 * An agent id is a random uuid, not a secret, so scoping every read/write
 * to the caller's own privy_user_id is what actually stops one user from
 * editing or deleting another user's agent by guessing/reusing an id.
 */

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const privyUserId = await requirePrivyUserId(req);
    const body = await req.json();

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
    if (typeof body.persona === "string") patch.persona = body.persona;
    if (typeof body.avatarUrl === "string" || body.avatarUrl === null) patch.avatar_url = body.avatarUrl;
    if (typeof body.accentColor === "string" || body.accentColor === null) patch.accent_color = body.accentColor;
    if (typeof body.emoji === "string" || body.emoji === null) patch.emoji = body.emoji;

    const supabase = getSupabaseServer();
    if (!supabase) throw new Error("Supabase is not configured on the server");
    const { data, error } = await supabase
      .from("wallet_agents")
      .update(patch)
      .eq("id", id)
      .eq("privy_user_id", privyUserId)
      .select("id, name, persona, avatar_url, accent_color, emoji, model, created_at")
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const privyUserId = await requirePrivyUserId(req);
    const supabase = getSupabaseServer();
    if (!supabase) throw new Error("Supabase is not configured on the server");
    const { error } = await supabase.from("wallet_agents").delete().eq("id", id).eq("privy_user_id", privyUserId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown) {
  if (err instanceof PrivyAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
  const message = err instanceof Error ? err.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}
