import { robinhoodChain } from "@/lib/chains";
import { WETH9 } from "@/lib/uniswap";
import type { QuoteAssetPrice } from "@/lib/quote-asset";
import { USDG } from "./dex/addresses";
import { fetchTokenPricesUsd } from "./gecko-price";

const USDG_DECIMALS = 6;
const WETH_DECIMALS = 18;

/**
 * The recognized quote assets on Robinhood Chain, each with a resolved USD
 * price — RWA_SPEC.md Phase 6's generalization beyond WETH-only. USDG is
 * priced at a flat $1 (it's Paxos' USD-pegged Global Dollar — the same
 * assumption already made in rwa/liquidity.ts); WETH's price comes from
 * GeckoTerminal via the same gecko-price.ts this app's Phase 1 registry
 * already uses for token pricing. WETH is left out of the returned list
 * entirely if its price couldn't be fetched — better to lose WETH-quoted
 * PnL for one pass than report it against a stale or fabricated number.
 */
export async function resolveQuoteAssets(): Promise<QuoteAssetPrice[]> {
  const assets: QuoteAssetPrice[] = [{ address: USDG, decimals: USDG_DECIMALS, usdPrice: 1 }];

  const prices = await fetchTokenPricesUsd(robinhoodChain.id, [WETH9]);
  const wethUsd = prices.get(WETH9.toLowerCase());
  if (wethUsd) assets.push({ address: WETH9, decimals: WETH_DECIMALS, usdPrice: wethUsd });

  return assets;
}
