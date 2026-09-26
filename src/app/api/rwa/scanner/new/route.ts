import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const maxDuration = 15;

const LIMIT = 50;

/**
 * RWA_SPEC.md Phase 5's New scanner tab — the most recently discovered
 * verified tokens (rwa_tokens.discovered_at, set at insert time by
 * run-registry.ts's Phase 1 pool-discovery pass). Pool-level "New" (a
 * fresh v4 Initialize event with no token behind it yet) needs Phase 6's
 * own indexer to attribute — this tab is scoped to tokens, which is what
 * the registry can already tell you about today.
 */
export async function GET() {
  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ indexed: false, rows: [] });

  const { data: tokens, error: tokensError } = await supabase
    .from("rwa_tokens")
    .select("chain_id, address, underlying_ticker, issuer_id, symbol, discovered_at")
    .eq("verified", true)
    .order("discovered_at", { ascending: false })
    .limit(LIMIT);
  if (tokensError) return NextResponse.json({ error: `Could not read rwa_tokens: ${tokensError.message}` }, { status: 500 });

  const tickers = [...new Set((tokens ?? []).map((t) => t.underlying_ticker))];
  const { data: underlyings, error: underlyingsError } = tickers.length
    ? await supabase.from("rwa_underlyings").select("ticker, name").in("ticker", tickers)
    : { data: [], error: null };
  if (underlyingsError) return NextResponse.json({ error: `Could not read rwa_underlyings: ${underlyingsError.message}` }, { status: 500 });

  const nameByTicker = new Map((underlyings ?? []).map((u) => [u.ticker, u.name]));

  return NextResponse.json({
    indexed: true,
    rows: (tokens ?? []).map((t) => ({
      ticker: t.underlying_ticker,
      name: nameByTicker.get(t.underlying_ticker) ?? t.underlying_ticker,
      chainId: t.chain_id,
      address: t.address,
      issuerId: t.issuer_id,
      symbol: t.symbol,
      discoveredAt: t.discovered_at,
    })),
  });
}
