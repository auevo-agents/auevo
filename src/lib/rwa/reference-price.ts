/**
 * The real-world reference price for a tokenized stock's underlying
 * ticker — what a token's own on-chain price is compared against to get
 * a premium/discount (RWA_SPEC.md Phase 1). Never invented: if no source
 * is configured or a lookup fails, this returns null and callers must
 * treat premium as unknown, not zero or stale.
 *
 * Provider choice, in the order RWA_SPEC.md itself asks for
 * ("сначала Chainlink/Pyth фиды где есть, иначе внешнее API котировок"):
 *
 * 1. Chainlink Data Streams — confirmed (2026-09-26 research) to be the
 *    REAL production choice: Ondo Finance's own blog names Chainlink as
 *    "the official on-chain data oracle" for its tokenized-stock line,
 *    and Backed Finance/xStocks separately announced Chainlink Data
 *    Streams + CCIP + Proof of Reserve for the same purpose. This is not
 *    a classic push-based Chainlink Price Feed (`latestAnswer()`) — it's
 *    a pull-based product (fetch a signed report off-chain, verify it
 *    on-chain or via their API) that needs a subscription and API
 *    credentials this session doesn't have and could not obtain (every
 *    attempt to reach docs.chain.link, li.quest, api.xstocks.fi and
 *    api.twelvedata.com from this sandbox was blocked by its own network
 *    policy — a sandbox-only restriction, not evidence these services are
 *    actually unreachable in production). **Not implemented yet** —
 *    `chainlinkStreams()` below is a documented stub, not a fake success.
 * 2. Twelve Data's simple `/price` REST endpoint — a working fallback,
 *    implemented below. Free-tier data is delayed (per Twelve Data's own
 *    published tier terms, corroborated via multiple independent
 *    write-ups since their own site was unreachable from this sandbox
 *    too) — every value this returns is tagged `delayed: true` so callers
 *    can disclose that in the UI (RWA_SPEC.md section 4's disclaimer
 *    requirement) rather than presenting it as live.
 *
 * Every HTTP call here is fresh (no `fetch` cache), unlike geckoterminal.ts
 * — geckoterminal.ts's requests share GeckoTerminal's own site-wide rate
 * limit and must collapse concurrent traffic onto one cache window;
 * Twelve Data's per-key rate limit is not shared with other visitors, so
 * caching is a call-count optimization for the once-per-5-minutes cron
 * that uses this, not a shared-resource necessity — the cron's own
 * interval is the cache.
 */

export interface ReferencePrice {
  priceUsd: number;
  asOf: Date;
  source: "chainlink" | "twelvedata";
  /** True when this price is not real-time — must be disclosed wherever it's shown as a premium/discount basis. */
  delayed: boolean;
}

/**
 * Not implemented — see the module doc comment above for exactly why
 * (needs Chainlink Data Streams subscription credentials and API details
 * this session could not confirm from a blocked sandbox network). Kept as
 * an explicit, named stub rather than silently folded into the "no
 * provider configured" case, so it's easy to find and wire up later
 * without hunting through reference-price.ts's control flow first.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept in the signature to document what this will need once implemented
async function chainlinkStreams(_ticker: string): Promise<ReferencePrice | null> {
  return null;
}

async function twelveData(ticker: string): Promise<ReferencePrice | null> {
  const apiKey = process.env.REFERENCE_PRICE_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;

    const data = (await res.json()) as { price?: string; code?: number };
    if (!data.price || data.code) return null; // Twelve Data reports errors as {code, message} rather than an HTTP error status

    const priceUsd = Number(data.price);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;

    return { priceUsd, asOf: new Date(), source: "twelvedata", delayed: true };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchReferencePrice(ticker: string): Promise<ReferencePrice | null> {
  const provider = (process.env.REFERENCE_PRICE_PROVIDER ?? "").trim().toLowerCase();

  if (provider === "chainlink") return chainlinkStreams(ticker);
  if (provider === "twelvedata") return twelveData(ticker);

  // No provider configured, or an unrecognized value — never guess which
  // one was meant.
  return null;
}

/** premium_bps = (price - reference) / reference * 10000, rounded to the nearest bp. Null propagates rather than becoming 0, which would read as "no premium" instead of "unknown". */
export function computePremiumBps(priceUsd: number | null, referencePriceUsd: number | null): number | null {
  if (priceUsd === null || referencePriceUsd === null || referencePriceUsd <= 0) return null;
  return Math.round(((priceUsd - referencePriceUsd) / referencePriceUsd) * 10_000);
}
