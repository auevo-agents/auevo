import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { loadBasket } from "@/lib/rwa/baskets";

export const maxDuration = 15;

/**
 * Basket detail — RWA_SPEC.md Phase 7's /app/baskets/[id]. Resolves each
 * holding's ticker to whatever verified rwa_tokens row exists for it on
 * this basket's own chain (never a claim that a ticker without one is
 * unavailable forever — just not tradeable through this basket right
 * now), plus that token's latest known price, so the UI can show real
 * addresses and a rough per-holding value instead of just the ticker list.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/rwa/baskets/[id]">) {
  const { id } = await ctx.params;

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ indexed: false });
  }

  try {
    const basket = await loadBasket(supabase, id);
    if (!basket) {
      return NextResponse.json({ error: "Unknown basket" }, { status: 404 });
    }

    const tickers = basket.holdings.map((h) => h.ticker);
    const { data: tokens, error: tokensError } = tickers.length
      ? await supabase
          .from("rwa_tokens")
          .select("address, underlying_ticker, symbol, decimals")
          .eq("chain_id", basket.chainId)
          .eq("verified", true)
          .in("underlying_ticker", tickers)
      : { data: [], error: null };
    if (tokensError) {
      return NextResponse.json({ error: `Could not read rwa_tokens: ${tokensError.message}` }, { status: 500 });
    }

    const tokenByTicker = new Map<string, { address: string; symbol: string; decimals: number }>();
    for (const t of tokens ?? []) {
      if (!tokenByTicker.has(t.underlying_ticker)) {
        tokenByTicker.set(t.underlying_ticker, { address: t.address, symbol: t.symbol, decimals: t.decimals });
      }
    }

    const addresses = [...tokenByTicker.values()].map((t) => t.address);
    const { data: priceRows, error: pricesError } = addresses.length
      ? await supabase
          .from("rwa_prices")
          .select("token_address, price_usd, ts")
          .eq("chain_id", basket.chainId)
          .in("token_address", addresses)
          .order("ts", { ascending: false })
          .limit(500)
      : { data: [], error: null };
    if (pricesError) {
      return NextResponse.json({ error: `Could not read rwa_prices: ${pricesError.message}` }, { status: 500 });
    }
    const latestPriceByAddress = new Map<string, number | null>();
    for (const row of priceRows ?? []) {
      const key = row.token_address.toLowerCase();
      if (!latestPriceByAddress.has(key)) latestPriceByAddress.set(key, row.price_usd);
    }

    const holdings = basket.holdings.map((h) => {
      const token = tokenByTicker.get(h.ticker) ?? null;
      return {
        ticker: h.ticker,
        targetWeight: h.targetWeight,
        token: token?.address ?? null,
        symbol: token?.symbol ?? null,
        decimals: token?.decimals ?? null,
        priceUsd: token ? (latestPriceByAddress.get(token.address.toLowerCase()) ?? null) : null,
        available: token !== null,
      };
    });

    return NextResponse.json({
      indexed: true,
      id: basket.id,
      kind: basket.kind,
      name: basket.name,
      description: basket.description,
      chainId: basket.chainId,
      source: basket.source,
      oneYearReturn: basket.oneYearReturn,
      holdings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
