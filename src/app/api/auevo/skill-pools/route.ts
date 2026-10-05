import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { listSuggestedSkillPools } from "@/lib/auevo/skill";

export const runtime = "nodejs";
export const revalidate = 60;

/** Public, free, no-key "pools worth trying" for the guided Skill flow — same convention as /api/auevo/markets. See listSuggestedSkillPools for why this can never leak the actual unique-trader answer. */
export async function GET() {
  try {
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ pools: [] });
    const pools = await listSuggestedSkillPools(supabase);
    return NextResponse.json({ pools });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
