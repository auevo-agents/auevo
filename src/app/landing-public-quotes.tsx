import type { PublicQuote } from "@/lib/rwa/public-quotes";

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  });
}

function QuoteContent({ quotes }: { quotes: PublicQuote[] }) {
  return (
    <>
      {quotes.map((q, i) => (
        <span className="landing2-ticker-item" key={`${q.symbol}-${i}`}>
          <b>{q.symbol}</b>
          <span>{formatUsd(q.priceUsd)}</span>
          {q.change24hPct !== null && (
            <span className={q.change24hPct >= 0 ? "landing2-ticker-up" : "landing2-ticker-down"}>
              {q.change24hPct >= 0 ? "+" : ""}
              {q.change24hPct.toFixed(2)}%
            </span>
          )}
          <span className="landing2-ticker-dot">·</span>
        </span>
      ))}
    </>
  );
}

/**
 * Replaces the static issuer/chain name row with a running marquee of
 * real quotes from a public API (lib/rwa/public-quotes.ts, CoinGecko's
 * keyless "Simple Price" endpoint) — a name list reads as a static
 * credits page; a moving line of real prices reads as a live market, the
 * same reason the scanner-backed LandingTicker above it exists. Renders
 * nothing when the fetch came back empty (a rate limit, a network
 * hiccup, or this sandbox's own blocked egress — never a fabricated row).
 */
export function PublicQuotesTicker({ quotes }: { quotes: PublicQuote[] }) {
  if (quotes.length === 0) return null;

  return (
    <div className="landing2-ticker">
      <div className="landing2-ticker-track">
        <QuoteContent quotes={quotes} />
        <QuoteContent quotes={quotes} />
      </div>
    </div>
  );
}
