import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { sortAssetSummaries, type AssetSort } from "@/lib/rwa/catalog";
import { loadTickerTokens } from "@/lib/rwa/scanner-data";

export const maxDuration = 15;

/**
 * RWA_SPEC.md Phase 3's /app/assets catalog. Reads through the server
 * (service-role Supabase client), same as every other data route in this
 * app — the public-read RLS policies from 0003_rwa.sql remain available
 * for a future direct-from-client query path, but this keeps the current
 * app-wide convention of never shipping a Supabase key to the browser.
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ indexed: false, assets: [] });
  }

  const { searchParams } = new URL(req.url);
  const sort: AssetSort = searchParams.get("sort") === "most_available" ? "most_available" : "alphabetical";

  const { error, summaries } = await loadTickerTokens(supabase);
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ indexed: true, assets: sortAssetSummaries(summaries, sort) });
}
