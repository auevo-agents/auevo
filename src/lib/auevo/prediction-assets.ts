import { getSupabaseServer } from "@/lib/supabase";
import { fetchTokenPricesUsd } from "@/lib/rwa/gecko-price";
import { isPlausibleStockPriceUsd } from "@/lib/rwa/pools";
import { robinhoodChain } from "@/lib/chains";

export interface PredictionAsset {
  address: `0x${string}`;
  chainId: number;
  ticker: string;
  symbol: string;
  priceUsd: number;
}

const MAX_ASSETS = 24;

/**
 * The Prediction "price bet" flow was hardcoded to SPY alone
 * (src/app/proofs/spy.ts) even though this app already tracks dozens of
 * verified, already-tokenized RWA assets on Robinhood Chain (stocks,
 * ETFs, commodities) — SPY just happened to be the first one wired up.
 * This surfaces the rest of them as real options too, priced live from
 * the SAME GeckoTerminal feed src/lib/social/verify-claims.ts settles
 * against (never the rwa_prices cache, which can lag or briefly
 * disagree) — so the price an agent sees while placing a bet is exactly
 * what it gets judged against later, never a different number.
 * isPlausibleStockPriceUsd filters out the handful of tokens whose price
 * feed is known-broken (e.g. a near-zero price from a dead pool) rather
 * than offering a bet nobody could reasonably take. SPY is pinned first
 * — the original default and the one asset most people recognize — the
 * rest alphabetical.
 */
export async function listPredictionAssets(): Promise<PredictionAsset[]> {
  const supabase = getSupabaseServer();
  if (!supabase) return [];

  const { data: tokens, error } = await supabase
    .from("rwa_tokens")
    .select("chain_id, address, underlying_ticker, symbol")
    .eq("chain_id", robinhoodChain.id)
    .eq("verified", true);
  if (error || !tokens) return [];

  const seenTickers = new Set<string>();
  const candidates = tokens.filter((t) => {
    if (seenTickers.has(t.underlying_ticker)) return false;
    seenTickers.add(t.underlying_ticker);
    return true;
  });

  const prices = await fetchTokenPricesUsd(
    robinhoodChain.id,
    candidates.map((t) => t.address)
  );

  const out: PredictionAsset[] = [];
  for (const t of candidates) {
    const price = prices.get(t.address.toLowerCase());
    if (price === undefined || !isPlausibleStockPriceUsd(price)) continue;
    out.push({ address: t.address as `0x${string}`, chainId: t.chain_id, ticker: t.underlying_ticker, symbol: t.symbol, priceUsd: price });
  }

  out.sort((a, b) => (a.ticker === "SPY" ? -1 : b.ticker === "SPY" ? 1 : a.ticker.localeCompare(b.ticker)));
  return out.slice(0, MAX_ASSETS);
}
