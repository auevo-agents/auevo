/**
 * DexScreener's public token endpoint — chain-agnostic by design: it
 * returns every pair it has indexed for a given token address across
 * every chain it covers, keyed by that pair's own `chainId` (a string
 * slug DexScreener assigns, not something this app has to guess the way
 * gecko-price.ts's NETWORK_SLUGS has to for GeckoTerminal). A freshly
 * deployed token's address is effectively unique globally, so this never
 * filters by chain — it just takes the most liquid pair returned, which
 * in practice is "the pair on whichever chain this token actually lives
 * on." No API key, no rate-limit tier: DexScreener's docs describe this
 * endpoint as free and public.
 */

const BASE = "https://api.dexscreener.com/latest/dex/tokens";

interface DexscreenerApiPair {
  chainId?: string;
  dexId?: string;
  url?: string;
  priceUsd?: string;
  fdv?: number;
  marketCap?: number;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
}

interface DexscreenerApiResponse {
  pairs?: DexscreenerApiPair[] | null;
}

export interface DexscreenerTokenData {
  priceUsd: number | null;
  /** Real circulating-supply market cap when DexScreener has it; falls back to fully-diluted value otherwise. */
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  priceChange24hPct: number | null;
  chainId: string | null;
  dexId: string | null;
  pairUrl: string | null;
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Returns null on any failure (unreachable, no pairs yet, malformed body) — a token with no live pool yet is not an error, just not priced. */
export async function fetchDexscreenerToken(address: string): Promise<DexscreenerTokenData | null> {
  try {
    const res = await fetch(`${BASE}/${address}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;

    const json = (await res.json()) as DexscreenerApiResponse;
    const pairs = Array.isArray(json.pairs) ? json.pairs : [];
    if (pairs.length === 0) return null;

    const best = pairs.reduce((a, b) => ((toNumber(b.liquidity?.usd) ?? 0) > (toNumber(a.liquidity?.usd) ?? 0) ? b : a));

    return {
      priceUsd: toNumber(best.priceUsd),
      marketCapUsd: toNumber(best.marketCap) ?? toNumber(best.fdv),
      liquidityUsd: toNumber(best.liquidity?.usd),
      volume24hUsd: toNumber(best.volume?.h24),
      priceChange24hPct: toNumber(best.priceChange?.h24),
      chainId: best.chainId ?? null,
      dexId: best.dexId ?? null,
      pairUrl: best.url ?? null,
    };
  } catch {
    return null;
  }
}
