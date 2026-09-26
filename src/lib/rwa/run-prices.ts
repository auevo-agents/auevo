import { getSupabaseServer } from "@/lib/supabase";
import { fetchTokenPricesUsd } from "./gecko-price";
import { fetchReferencePrice, computePremiumBps } from "./reference-price";

/**
 * RWA_SPEC.md Phase 1's price/liquidity cron — "каждые 5 мин". Vercel's
 * Hobby plan (this project's actual plan — see the same note on
 * api/cron/index-chain) only fires cron jobs once a day regardless of the
 * schedule string, so vercel.json's entry for this route is aspirational
 * until the plan changes; it can also be triggered manually or from an
 * external scheduler in the meantime, same workaround already in use for
 * the chain indexer.
 *
 * `liquidity_usd`/`volume_24h_usd` are deliberately left null here, not
 * guessed: Robinhood Chain's own RWA pools are all Uniswap v4
 * (lib/rwa/registry.ts), which has no per-pool contract address the way
 * v3 does, so this app's existing pool-address-keyed GeckoTerminal
 * liquidity data (lib/geckoterminal.ts's fetchMarketPool) has nothing to
 * key off of for them. Filling this in needs either GeckoTerminal
 * exposing v4 pools by their own id (not confirmed), or Phase 6's own
 * indexer computing it directly from indexed pool reserves.
 */
export interface PricesRunResult {
  status: "ok" | "skipped";
  reason?: string;
  tokensConsidered?: number;
  priced?: number;
}

export async function runPricesPass(): Promise<PricesRunResult> {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return { status: "skipped", reason: "Supabase not configured" };
  }

  const { data: tokens, error: tokensError } = await supabase
    .from("rwa_tokens")
    .select("chain_id, address, underlying_ticker")
    .eq("verified", true);
  if (tokensError) {
    throw new Error(`Could not read rwa_tokens: ${tokensError.message}`);
  }
  if (!tokens || tokens.length === 0) {
    return { status: "ok", tokensConsidered: 0, priced: 0 };
  }

  const byChain = new Map<number, { address: string; underlyingTicker: string }[]>();
  for (const t of tokens) {
    const list = byChain.get(t.chain_id) ?? [];
    list.push({ address: t.address, underlyingTicker: t.underlying_ticker });
    byChain.set(t.chain_id, list);
  }

  const priceByKey = new Map<string, number>();
  await Promise.all(
    [...byChain.entries()].map(async ([chainId, group]) => {
      const prices = await fetchTokenPricesUsd(
        chainId,
        group.map((g) => g.address)
      );
      for (const [address, price] of prices) {
        priceByKey.set(`${chainId}:${address}`, price);
      }
    })
  );

  const tickers = [...new Set(tokens.map((t) => t.underlying_ticker))];
  const refByTicker = new Map<string, number | null>();
  await Promise.all(
    tickers.map(async (ticker) => {
      const ref = await fetchReferencePrice(ticker);
      refByTicker.set(ticker, ref?.priceUsd ?? null);
    })
  );

  const rows = tokens
    .map((t) => {
      const priceUsd = priceByKey.get(`${t.chain_id}:${t.address.toLowerCase()}`) ?? null;
      const referencePriceUsd = refByTicker.get(t.underlying_ticker) ?? null;
      return {
        chain_id: t.chain_id,
        token_address: t.address,
        price_usd: priceUsd,
        reference_price_usd: referencePriceUsd,
        premium_bps: computePremiumBps(priceUsd, referencePriceUsd),
        liquidity_usd: null,
        volume_24h_usd: null,
        mkt_cap_usd: null,
      };
    })
    // A snapshot with no price at all isn't worth a row — nothing in it
    // would ever be read back.
    .filter((r) => r.price_usd !== null);

  if (rows.length > 0) {
    const { error } = await supabase.from("rwa_prices").insert(rows);
    if (error) throw new Error(`rwa_prices insert failed: ${error.message}`);
  }

  return { status: "ok", tokensConsidered: tokens.length, priced: rows.length };
}
