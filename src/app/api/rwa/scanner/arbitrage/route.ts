import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { loadTickerTokens } from "@/lib/rwa/scanner-data";
import { buildArbitrageRows, sortBySpreadDesc } from "@/lib/rwa/scanner";

export const maxDuration = 15;

/**
 * RWA_SPEC.md Phase 5's Arbitrage scanner tab — same-ticker tokens across
 * issuers/chains with a price spread, sorted by spread descending. The
 * spread is RAW (not netted against a bridge's fee/time) — see
 * rwa/scanner.ts's ArbitrageRow doc comment for why a live LI.FI quote per
 * row isn't computed here; /app/swap's Bridge tab gives a real, netted
 * quote once a specific pair is chosen.
 */
export async function GET() {
  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ indexed: false, rows: [] });

  const { error, summaries } = await loadTickerTokens(supabase);
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ indexed: true, rows: sortBySpreadDesc(buildArbitrageRows(summaries)) });
}
