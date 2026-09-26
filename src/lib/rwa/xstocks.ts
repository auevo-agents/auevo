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

export async function fetchXstocksTokenList(): Promise<XstocksToken[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(tokenListUrl(), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as TokenListResponse;
    if (!Array.isArray(data.tokens)) return null;

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
    return tokens;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
