/**
 * xStocks (Backed Finance)'s own standard Uniswap-format token list —
 * RWA_SPEC.md Phase 1's cross-chain registry source for this issuer.
 * Fetched live and verified against the real file 2026-09-26 (this
 * session's own sandbox could reach raw.githubusercontent.com even
 * though api.xstocks.fi, li.quest and every other candidate API/docs
 * page it tried were blocked by network policy) — 6,431 entries across 8
 * EVM chains (Ethereum, Optimism, BNB Chain, X Layer, HyperEVM, Mantle,
 * Arbitrum, Ink), in the standard `{chainId, address, symbol, name,
 * decimals, logoURI}` shape (tokenlists.org), so there is no
 * decimals-unknown problem the way there would be trying to reconstruct
 * this from a generic multi-issuer list by suffix-guessing alone.
 *
 * Not Base or Solana — a real, sourced gap in xStocks' own current
 * coverage as of this fetch, not a shortcut taken here. Ondo Finance has
 * no public machine-readable list at all (confirmed by a dedicated search
 * this session ran, not assumed) — cross-chain Ondo listings stay out of
 * the registry until a real source for them turns up.
 */

/** XSTOCKS_TOKENLIST_URL overrides the default — same pattern as GECKOTERMINAL_API_URL, used by run-registry.integration.test.ts to point this at a scripted server instead of the real one. */
function tokenListUrl(): string {
  return (
    process.env.XSTOCKS_TOKENLIST_URL?.trim() ||
    "https://raw.githubusercontent.com/backed-fi/cowswap-xstocks-tokenlist/main/tokenlist.json"
  );
}

export interface XstocksToken {
  chainId: number;
  address: string;
  name: string;
  symbol: string; // e.g. "NVDAx"
  decimals: number;
}

interface TokenListResponse {
  tokens?: {
    chainId?: unknown;
    address?: unknown;
    name?: unknown;
    symbol?: unknown;
    decimals?: unknown;
  }[];
}

export interface XstocksFetchResult {
  tokens: XstocksToken[] | null;
  /** Why `tokens` is null — production has shown `xstocks.available: false` with no way to tell a network blip from a real outage apart, so the registry cron surfaces this instead of a bare boolean. */
  error: string | null;
}

async function fetchOnce(): Promise<XstocksFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7_000);

  try {
    const res = await fetch(tokenListUrl(), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { tokens: null, error: `HTTP ${res.status}` };

    const data = (await res.json()) as TokenListResponse;
    if (!Array.isArray(data.tokens)) return { tokens: null, error: "response missing tokens[]" };

    const tokens: XstocksToken[] = [];
    for (const t of data.tokens) {
      if (
        typeof t.chainId === "number" &&
        typeof t.address === "string" &&
        typeof t.name === "string" &&
        typeof t.symbol === "string" &&
        typeof t.decimals === "number"
      ) {
        tokens.push({ chainId: t.chainId, address: t.address, name: t.name, symbol: t.symbol, decimals: t.decimals });
      }
    }
    return { tokens, error: null };
  } catch (err) {
    return { tokens: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One bounded retry on top of `fetchOnce` — the same transient-network
 * reasoning as `db-retry.ts`'s `withFetchRetry`, applied to a plain
 * external fetch instead of a Supabase call, after production showed
 * `xstocks.available: false` on a run where this same
 * raw.githubusercontent.com URL had been fetched successfully during
 * this feature's own research. Each attempt gets a shorter 7s timeout
 * (down from the old single 15s one) so worst case (two failed
 * attempts) still fits inside the registry cron's 30s budget alongside
 * the chain scan it runs next to.
 */
export async function fetchXstocksTokenListWithDiagnostics(): Promise<XstocksFetchResult> {
  let result = await fetchOnce();
  if (!result.tokens) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    result = await fetchOnce();
  }
  return result;
}

/** Thin wrapper over `fetchXstocksTokenListWithDiagnostics` for callers that only care whether the list came back, not why it didn't. */
export async function fetchXstocksTokenList(): Promise<XstocksToken[] | null> {
  return (await fetchXstocksTokenListWithDiagnostics()).tokens;
}

/**
 * "NVDAx" -> "NVDA", "BRK.Bx" -> "BRK.B" — xStocks' own, consistent
 * suffix convention (RWA_SPEC.md section 2). Returns null for anything
 * that doesn't end in "x" with at least one character before it, rather
 * than guessing at a ticker for a symbol that doesn't fit the pattern.
 */
export function tickerFromXstocksSymbol(symbol: string): string | null {
  if (!symbol.endsWith("x") || symbol.length < 2) return null;
  return symbol.slice(0, -1).toUpperCase();
}
