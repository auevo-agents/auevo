import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { robinhoodChain } from "@/lib/chains";

export const maxDuration = 15;

const PRICE_HISTORY_LIMIT = 500;

/**
 * RWA_SPEC.md Phase 3's asset detail page (/app/assets/[ticker]) — every
 * token for this ticker across issuers/chains, each with its latest
 * price/premium, plus the price history of one "primary" token (the
 * Robinhood Chain listing if one exists, else whichever token has the
 * most history) for the chart. Multiple tokens' histories are never
 * merged into one series — different pools, different liquidity, a
 * blended line would misrepresent all of them.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/rwa/assets/[ticker]">) {
  const { ticker: rawTicker } = await ctx.params;
  const ticker = decodeURIComponent(rawTicker).toUpperCase();

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ indexed: false });
  }

  const { data: underlying, error: underlyingError } = await supabase
    .from("rwa_underlyings")
    .select("ticker, name, category, exchange, reference_source")
    .eq("ticker", ticker)
    .maybeSingle();
  if (underlyingError) {
    return NextResponse.json({ error: `Could not read rwa_underlyings: ${underlyingError.message}` }, { status: 500 });
  }
  if (!underlying) {
    return NextResponse.json({ error: "Unknown ticker" }, { status: 404 });
  }

  const { data: tokens, error: tokensError } = await supabase
    .from("rwa_tokens")
    .select("chain_id, address, issuer_id, symbol, decimals")
    .eq("underlying_ticker", ticker)
    .eq("verified", true);
  if (tokensError) {
    return NextResponse.json({ error: `Could not read rwa_tokens: ${tokensError.message}` }, { status: 500 });
  }

  const tokenKeys = (tokens ?? []).map((t) => `${t.chain_id}:${t.address.toLowerCase()}`);
  const { data: latestPriceRows, error: pricesError } = tokenKeys.length
    ? await supabase
        .from("rwa_prices")
        .select("chain_id, token_address, price_usd, premium_bps, ts")
        .in(
          "token_address",
          (tokens ?? []).map((t) => t.address)
        )
        .order("ts", { ascending: false })
        .limit(2000)
    : { data: [] as { chain_id: number; token_address: string; price_usd: number | null; premium_bps: number | null; ts: string }[], error: null };
  if (pricesError) {
    return NextResponse.json({ error: `Could not read rwa_prices: ${pricesError.message}` }, { status: 500 });
  }

  const latestByKey = new Map<string, { priceUsd: number | null; premiumBps: number | null; ts: string }>();
  for (const r of latestPriceRows ?? []) {
    const key = `${r.chain_id}:${r.token_address.toLowerCase()}`;
    if (!latestByKey.has(key)) latestByKey.set(key, { priceUsd: r.price_usd, premiumBps: r.premium_bps, ts: r.ts });
  }

  const tokenRows = (tokens ?? []).map((t) => {
    const latest = latestByKey.get(`${t.chain_id}:${t.address.toLowerCase()}`);
    return {
      chainId: t.chain_id,
      address: t.address,
      issuerId: t.issuer_id,
      symbol: t.symbol,
      decimals: t.decimals,
      priceUsd: latest?.priceUsd ?? null,
      premiumBps: latest?.premiumBps ?? null,
      priceAsOf: latest?.ts ?? null,
    };
  });

  const primaryToken =
    tokenRows.find((t) => t.chainId === robinhoodChain.id) ?? tokenRows.find((t) => t.priceUsd !== null) ?? tokenRows[0] ?? null;

  let priceHistory: { ts: string; priceUsd: number | null; referencePriceUsd: number | null }[] = [];
  if (primaryToken) {
    const { data: historyRows, error: historyError } = await supabase
      .from("rwa_prices")
      .select("ts, price_usd, reference_price_usd")
      .eq("chain_id", primaryToken.chainId)
      .eq("token_address", primaryToken.address)
      .order("ts", { ascending: true })
      .limit(PRICE_HISTORY_LIMIT);
    if (historyError) {
      return NextResponse.json({ error: `Could not read price history: ${historyError.message}` }, { status: 500 });
    }
    priceHistory = (historyRows ?? []).map((r) => ({ ts: r.ts, priceUsd: r.price_usd, referencePriceUsd: r.reference_price_usd }));
  }

  const issuerIds = [...new Set(tokenRows.map((t) => t.issuerId))];
  const { data: issuers, error: issuersError } = issuerIds.length
    ? await supabase.from("rwa_issuers").select("id, name, website, description, backing_note, suffix").in("id", issuerIds)
    : { data: [], error: null };
  if (issuersError) {
    return NextResponse.json({ error: `Could not read rwa_issuers: ${issuersError.message}` }, { status: 500 });
  }

  return NextResponse.json({
    indexed: true,
    ticker: underlying.ticker,
    name: underlying.name,
    category: underlying.category,
    exchange: underlying.exchange,
    referenceConfigured: Boolean(underlying.reference_source),
    tokens: tokenRows,
    primaryChainId: primaryToken?.chainId ?? null,
    primaryAddress: primaryToken?.address ?? null,
    priceHistory,
    issuers: issuers ?? [],
  });
}
