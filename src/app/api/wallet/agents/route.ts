import { NextResponse } from "next/server";
import { ensureProfile } from "@/lib/wallet/db";
import { PrivyAuthError, requirePrivyUserId } from "@/lib/wallet/privy-server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const privyUserId = await requirePrivyUserId(req);
    const supabase = await ensureProfile(privyUserId);
    const { data, error } = await supabase
      .from("wallet_agents")
      .select("id, name, persona, avatar_url, accent_color, emoji, model, created_at")
      .eq("privy_user_id", privyUserId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const privyUserId = await requirePrivyUserId(req);
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    const persona = typeof body.persona === "string" ? body.persona : "";
    const avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl : null;
    const accentColor = typeof body.accentColor === "string" ? body.accentColor : null;
    const emoji = typeof body.emoji === "string" ? body.emoji : null;

    const supabase = await ensureProfile(privyUserId);
    // Presets (see PRESET_AGENTS in page.tsx) are just regular agents the
    // client creates on first pick — dedupe on name so re-picking a preset
    // reuses its row instead of piling up duplicates.
    const { data: existing } = await supabase
      .from("wallet_agents")
      .select("id, name, persona, avatar_url, accent_color, emoji, model, created_at")
      .eq("privy_user_id", privyUserId)
      .eq("name", name)
      .maybeSingle();
    if (existing) return NextResponse.json(existing, { status: 200 });

    const { data, error } = await supabase
      .from("wallet_agents")
      .insert({ privy_user_id: privyUserId, name, persona, avatar_url: avatarUrl, accent_color: accentColor, emoji })
      .select("id, name, persona, avatar_url, accent_color, emoji, model, created_at")
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
