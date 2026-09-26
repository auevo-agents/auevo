/**
 * GeckoTerminal's token-price endpoint, generalized across chains —
 * separate from lib/geckoterminal.ts, which is hardcoded to the
 * "robinhood" network for the rest of this app's (Robinhood-Chain-only)
 * market data. RWA_SPEC.md Phase 1 needs prices for xStocks tokens on
 * Ethereum, Arbitrum, BNB Chain etc. too (see lib/rwa/xstocks.ts).
 *
 * Uses the token-address-keyed `/simple/networks/{network}/token_price/`
 * endpoint rather than a pool-address-keyed one deliberately: Robinhood
 * Chain's own RWA pools are all Uniswap v4 (lib/rwa/registry.ts), and v4
 * has no per-pool contract address the way v3 does — there is nothing to
 * hand a pool-address-shaped endpoint. A token-address lookup works the
 * same way regardless of which pool version backs it.
 *
 * Network-slug mapping is deliberately incomplete: only chains this
 * session could confirm GeckoTerminal's own slug for are listed. A chain
 * id with no entry here has its price left unset rather than guessed —
 * xStocks' own token list (see xstocks.ts) covers a few chains (X Layer,
 * HyperEVM, Ink) whose GeckoTerminal slugs were not verified, so pricing
 * silently doesn't apply to tokens on those chains yet.
 */

const NETWORK_SLUGS: Record<number, string> = {
  1: "eth",
  10: "optimism",
  56: "bsc",
  4663: "robinhood",
  5000: "mantle",
  8453: "base",
  42161: "arbitrum",
};

const BATCH_SIZE = 30; // GeckoTerminal's own documented limit for this endpoint

function baseUrl(): string {
  const configured = process.env.GECKOTERMINAL_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return "https://api.geckoterminal.com/api/v2";
}

interface SimplePriceResponse {
  data?: {
    attributes?: {
      token_prices?: Record<string, string>;
    };
  };
}

async function fetchBatch(network: string, addresses: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const url = `${baseUrl()}/simple/networks/${network}/token_price/${addresses.join(",")}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return result;

    const json = (await res.json()) as SimplePriceResponse;
    const prices = json.data?.attributes?.token_prices;
    if (!prices) return result;

    for (const [address, priceStr] of Object.entries(prices)) {
      const price = Number(priceStr);
      if (Number.isFinite(price) && price > 0) result.set(address.toLowerCase(), price);
    }
  } catch {
    // Leave whatever wasn't fetched unpriced — a partial price snapshot beats none.
  }

  return result;
}

/** Returns a map keyed by lowercased address; a token absent from the result was not priced (unlisted on GeckoTerminal, or the chain's slug isn't in NETWORK_SLUGS above). */
export async function fetchTokenPricesUsd(chainId: number, addresses: string[]): Promise<Map<string, number>> {
  const network = NETWORK_SLUGS[chainId];
  if (!network || addresses.length === 0) return new Map();

  const batches: string[][] = [];
  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    batches.push(addresses.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(batches.map((batch) => fetchBatch(network, batch)));
  const merged = new Map<string, number>();
  for (const batchResult of results) {
    for (const [address, price] of batchResult) merged.set(address, price);
  }
  return merged;
}
