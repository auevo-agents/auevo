import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { listBaskets } from "@/lib/rwa/baskets";

export const maxDuration = 15;

/**
 * RWA_SPEC.md Phase 7's basket list — /app/baskets. Also reports how many
 * of each basket's holdings actually have a verified on-chain token on
 * that basket's own chain — most baskets here were composed from
 * rwa_underlyings' full 100-ticker catalog, not from what Robinhood Chain
 * itself has real xStocks deployments for today (a handful of tickers),
 * so "N holdings" alone overstates what's actually tradeable. The basket
 * detail page still shows every holding (real composition context), this
 * just lets the list page be upfront about it before a click.
 */
export async function GET() {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ indexed: false, baskets: [] });
  }

  try {
    const baskets = await listBaskets(supabase);

    const chainIds = [...new Set(baskets.map((b) => b.chainId))];
    const verifiedByChain = new Map<number, Set<string>>();
    if (chainIds.length > 0) {
      const { data: tokens, error: tokensError } = await supabase
        .from("rwa_tokens")
        .select("chain_id, underlying_ticker")
        .eq("verified", true)
        .in("chain_id", chainIds);
      if (tokensError) throw new Error(`Could not read rwa_tokens: ${tokensError.message}`);
      for (const t of tokens ?? []) {
        const set = verifiedByChain.get(t.chain_id) ?? new Set<string>();
        set.add(t.underlying_ticker);
        verifiedByChain.set(t.chain_id, set);
      }
    }

    const withAvailability = baskets.map((b) => {
      const verified = verifiedByChain.get(b.chainId) ?? new Set<string>();
      const availableCount = b.holdings.filter((h) => verified.has(h.ticker)).length;
      return { ...b, availableCount, totalCount: b.holdings.length };
    });

    return NextResponse.json({ indexed: true, baskets: withAvailability });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
