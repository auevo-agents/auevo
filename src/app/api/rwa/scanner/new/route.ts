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

  // Latest known price per (chain, address) — this route never fetched
  // rwa_prices at all before, so every row here showed no price even for
  // tokens Premium/Risk/Liquidity already price fine. Same "latest row
  // wins" join /api/rwa/baskets/[id] already uses.
  const { data: priceRows, error: pricesError } = tokens?.length
    ? await supabase
        .from("rwa_prices")
        .select("chain_id, token_address, price_usd, ts")
        .in(
          "token_address",
          tokens.map((t) => t.address)
        )
        .order("ts", { ascending: false })
        .limit(2000)
    : { data: [], error: null };
  if (pricesError) return NextResponse.json({ error: `Could not read rwa_prices: ${pricesError.message}` }, { status: 500 });

  const latestPriceByKey = new Map<string, number | null>();
  for (const row of priceRows ?? []) {
    const key = `${row.chain_id}:${row.token_address.toLowerCase()}`;
    if (!latestPriceByKey.has(key)) latestPriceByKey.set(key, row.price_usd);
  }

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
      priceUsd: latestPriceByKey.get(`${t.chain_id}:${t.address.toLowerCase()}`) ?? null,
    })),
  });
}
