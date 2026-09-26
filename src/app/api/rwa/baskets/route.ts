import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { listBaskets } from "@/lib/rwa/baskets";

export const maxDuration = 15;

/** RWA_SPEC.md Phase 7's basket list — /app/baskets. */
export async function GET() {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ indexed: false, baskets: [] });
  }

  try {
    const baskets = await listBaskets(supabase);
    return NextResponse.json({ indexed: true, baskets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
