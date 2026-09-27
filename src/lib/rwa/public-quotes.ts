/**
 * Live quotes for the landing page's ticker — CoinGecko's public
 * `/simple/price` endpoint, chosen specifically because it needs no API
 * key or account at all (its "Public API" / demo tier), unlike
 * reference-price.ts's Twelve Data integration (a paid key even on its
 * free tier, and scoped to this app's own stock-premium calculation, not
 * a general "what's moving" ticker).
 *
 * FLAGGED, NOT FABRICATED: this sandbox's own egress policy returns 403
 * for api.coingecko.com (confirmed via a direct curl, not assumed), so
 * this integration could not be exercised against the live endpoint from
 * here — same situation as kamino.ts and reference-price.ts's Twelve
 * Data path, and handled the same way: built exactly to CoinGecko's own
 * long-stable, extremely widely used public contract (documented at
 * https://www.coingecko.com/en/api/documentation, "Simple Price"), not
 * guessed. Confirm it once from a network that can actually reach it
 * before relying on this in production; if the host is blocked from your
 * deployment platform too, request-level errors here degrade to an empty
 * quote list rather than a crash or a fabricated price.
 *
 * The id list is deliberately short and hand-picked rather than derived
 * from this app's own ticker catalog: CoinGecko coin ids are a separate
 * namespace from stock tickers entirely (rwa_underlyings holds none of
 * these except PAXG/XAUT, this app's own gold-backed commodity
 * underlyings — a genuine overlap, not a coincidence). A wrong id here
 * simply doesn't appear in CoinGecko's response (its own API drops
 * unknown ids rather than erroring), so it silently disappears from the
 * ticker rather than ever showing an invented price for it.
 */

export interface PublicQuote {
  symbol: string;
  name: string;
  priceUsd: number;
  change24hPct: number | null;
}

const CURATED_IDS: { id: string; symbol: string; name: string }[] = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "pax-gold", symbol: "PAXG", name: "PAX Gold" },
  { id: "tether-gold", symbol: "XAUT", name: "Tether Gold" },
  { id: "ondo-finance", symbol: "ONDO", name: "Ondo Finance" },
  { id: "ethena", symbol: "ENA", name: "Ethena" },
];

interface CoinGeckoSimplePriceRow {
  usd?: number;
  usd_24h_change?: number;
}

export async function fetchPublicQuotes(): Promise<PublicQuote[]> {
  const ids = CURATED_IDS.map((c) => c.id).join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;

  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate: 60 }, // the keyless tier shares a modest global rate limit — cache rather than call it on every landing-page render
    });
    if (!res.ok) return [];

    const data = (await res.json()) as Record<string, CoinGeckoSimplePriceRow>;
    const quotes: PublicQuote[] = [];
    for (const entry of CURATED_IDS) {
      const row = data[entry.id];
      if (!row || typeof row.usd !== "number") continue;
      quotes.push({
        symbol: entry.symbol,
        name: entry.name,
        priceUsd: row.usd,
        change24hPct: typeof row.usd_24h_change === "number" ? row.usd_24h_change : null,
      });
    }
    return quotes;
  } catch {
    return [];
  }
}
