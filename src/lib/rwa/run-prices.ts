import { getSupabaseServer } from "@/lib/supabase";
import { getRobinhoodClient } from "@/lib/evm/client";
import { robinhoodChain } from "@/lib/chains";
import { fetchTokenPricesUsd } from "./gecko-price";
import { fetchReferencePrice, computePremiumBps } from "./reference-price";
import { computeTokenPriceUsdFromPool } from "./pools";
import { STATE_VIEW_SLOT0_ABI } from "./registry";
import { STATE_VIEW, USDG } from "./dex/addresses";
import { withFetchRetry } from "./db-retry";

/**
 * RWA_SPEC.md Phase 1's price/liquidity cron — spec wants "каждые 5 мин",
 * but Vercel's Hobby plan (this project's actual plan) doesn't just
 * silently downgrade a sub-daily cron schedule to once a day — it REJECTS
 * the whole deployment outright at build time ("Hobby accounts are
 * limited to daily cron jobs"). An earlier version of this comment
 * assumed the former (harmless silent downgrade) and was wrong: that
 * assumption is exactly what silently broke every deploy of this project
 * from the commit that first added an every-5-minutes cron entry to
 * vercel.json onward, discovered 2026-09-26 only once a manual `vercel --prod`
 * surfaced the real build error. vercel.json's entry for this route is
 * once-daily like the other crons here; running more often needs either
 * the Pro plan or an external scheduler hitting this route directly
 * (same workaround already in use for the chain indexer).
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

  const { data: tokens, error: tokensError } = await withFetchRetry(() =>
    supabase.from("rwa_tokens").select("chain_id, address, underlying_ticker, decimals").eq("verified", true)
  );
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

  // Robinhood Chain's own primary price source: this app already
  // verified these pools exist (rwa_pools, from registry.ts), so it
  // reads its own price back directly from StateView rather than waiting
  // on GeckoTerminal to have indexed a brand-new L2's pools — see
  // pools.ts's computeTokenPriceUsdFromPool for the derivation. Always
  // overrides whatever (if anything) GeckoTerminal returned for these
  // tokens: a live on-chain read of a pool this app itself discovered is
  // more trustworthy than a third party's coverage of it.
  const { data: robinhoodPools, error: robinhoodPoolsError } = await withFetchRetry(() =>
    supabase.from("rwa_pools").select("pool_id, token0, token1").eq("chain_id", robinhoodChain.id).eq("dex", "uniswap_v4")
  );
  if (robinhoodPoolsError) {
    throw new Error(`Could not read rwa_pools: ${robinhoodPoolsError.message}`);
  }
  if (robinhoodPools && robinhoodPools.length > 0) {
    const decimalsByAddress = new Map(
      tokens.filter((t) => t.chain_id === robinhoodChain.id).map((t) => [t.address.toLowerCase(), t.decimals])
    );
    const client = getRobinhoodClient();
    await Promise.all(
      robinhoodPools.map(async (pool) => {
        const usdgIsCurrency0 = pool.token0.toLowerCase() === USDG.toLowerCase();
        const tokenAddress = (usdgIsCurrency0 ? pool.token1 : pool.token0).toLowerCase();
        const tokenDecimals = decimalsByAddress.get(tokenAddress);
        if (tokenDecimals === undefined) return; // not one of this pass's verified tokens

        try {
          const slot0 = await client.readContract({
            address: STATE_VIEW,
            abi: STATE_VIEW_SLOT0_ABI,
            functionName: "getSlot0",
            args: [pool.pool_id as `0x${string}`],
          });
          const price = computeTokenPriceUsdFromPool({ sqrtPriceX96: slot0[0], usdgIsCurrency0, tokenDecimals });
          if (price !== null) priceByKey.set(`${robinhoodChain.id}:${tokenAddress}`, price);
        } catch {
          // Node hiccup on this one pool — GeckoTerminal's own coverage (if any) stays as the fallback for it this pass.
        }
      })
    );
  }

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
    const { error } = await withFetchRetry(() => supabase.from("rwa_prices").insert(rows));
    if (error) throw new Error(`rwa_prices insert failed: ${error.message}`);
  }

  return { status: "ok", tokensConsidered: tokens.length, priced: rows.length };
}
