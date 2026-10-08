import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const maxDuration = 15;

/** RWA_SPEC.md Phase 3's /app/issuers — each issuer plus how many verified tokens/tickers they actually have registered, not just their static profile. */
export async function GET() {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ indexed: false, issuers: [] });
  }

  const [{ data: issuers, error: issuersError }, { data: tokens, error: tokensError }] = await Promise.all([
    supabase.from("rwa_issuers").select("id, name, suffix, website, description, backing_note"),
    supabase.from("rwa_tokens").select("issuer_id, underlying_ticker").eq("verified", true),
  ]);

  if (issuersError) return NextResponse.json({ error: `Could not read rwa_issuers: ${issuersError.message}` }, { status: 500 });
  if (tokensError) return NextResponse.json({ error: `Could not read rwa_tokens: ${tokensError.message}` }, { status: 500 });

  const tickersByIssuer = new Map<string, Set<string>>();
  const tokenCountByIssuer = new Map<string, number>();
  for (const t of tokens ?? []) {
    tokenCountByIssuer.set(t.issuer_id, (tokenCountByIssuer.get(t.issuer_id) ?? 0) + 1);
    const set = tickersByIssuer.get(t.issuer_id) ?? new Set<string>();
    set.add(t.underlying_ticker);
    tickersByIssuer.set(t.issuer_id, set);
  }

  const result = (issuers ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    suffix: i.suffix,
    website: i.website,
    description: i.description,
    backingNote: i.backing_note,
    tickerCount: tickersByIssuer.get(i.id)?.size ?? 0,
    tokenCount: tokenCountByIssuer.get(i.id) ?? 0,
  }));

  return NextResponse.json({ indexed: true, issuers: result });
}
