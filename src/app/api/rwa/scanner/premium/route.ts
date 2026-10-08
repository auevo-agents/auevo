import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { loadTickerTokens } from "@/lib/rwa/scanner-data";
import { buildPremiumRows, sortByAbsPremium } from "@/lib/rwa/scanner";

export const maxDuration = 15;

/**
 * RWA_SPEC.md Phase 5's Premium scanner tab — every priced token across
 * every ticker, ranked by |premium| to its real-world reference price.
 */
export async function GET() {
  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ indexed: false, rows: [] });

  const { error, summaries } = await loadTickerTokens(supabase);
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ indexed: true, rows: sortByAbsPremium(buildPremiumRows(summaries)) });
}
