/**
 * Kamino Finance's public lending-market API — RWA_SPEC.md Phase 8's
 * `/app/lend` ("Kamino xStocks markets через их публичный API").
 *
 * FLAGGED, NOT FABRICATED: api.kamino.finance was unreachable from this
 * environment (network egress blocked both directly and via a
 * background research pass), so the endpoint path and field names below
 * are corroborated from search-engine snippets of Kamino's own docs
 * (kamino.com/docs/curators/markets/market-data) and a third-party
 * OpenAPI mirror (github.com/api-evangelist/kamino), not read first-hand
 * from Kamino's own live Swagger UI. Nobody has confirmed the actual
 * on-chain pubkey of Kamino's xStocks market either — xStocks lending is
 * confirmed to exist as a real Kamino Lend market (Chainlink's own
 * announcement, The Block, The Defiant all cover the integration), but
 * which specific market pubkey that is was not found. Both gaps are why
 * `KAMINO_XSTOCKS_MARKET_PUBKEY` below defaults to unset rather than a
 * guessed value — same posture this codebase already takes for anything
 * it can't verify (see e.g. dex/addresses.ts's own sourcing discipline).
 * Whoever sets that env var should first open
 * https://api.kamino.finance/documentation/ in a real browser to confirm
 * the path/fields match what this file assumes, and fix this file if not.
 */

const KAMINO_API_BASE = "https://api.kamino.finance";

export interface KaminoReserveMetrics {
  reservePubkey: string;
  liquidityTokenMint: string;
  supplyApyPct: number | null;
  borrowApyPct: number | null;
  totalSupplyUsd: number | null;
  totalBorrowUsd: number | null;
}

interface RawKaminoReserve {
  reserve?: string;
  liquidityTokenMint?: string;
  supplyApy?: number;
  borrowApy?: number;
  totalSupplyUsd?: number;
  totalBorrowUsd?: number;
}

/**
 * Fetches a market's reserve metrics. Returns null on any network/shape
 * failure rather than throwing — the caller (the /app/lend route) treats
 * null the same as "not configured": an honest gap, never a guess.
 */
export async function fetchKaminoMarketReserves(marketPubkey: string): Promise<KaminoReserveMetrics[] | null> {
  let res: Response;
  try {
    res = await fetch(`${KAMINO_API_BASE}/kamino-market/${marketPubkey}/reserves/metrics`, {
      headers: { accept: "application/json" },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;

  const reserves = (raw as RawKaminoReserve[])
    .filter((r) => typeof r.reserve === "string" && typeof r.liquidityTokenMint === "string")
    .map((r) => ({
      reservePubkey: r.reserve!,
      liquidityTokenMint: r.liquidityTokenMint!,
      supplyApyPct: typeof r.supplyApy === "number" ? r.supplyApy * 100 : null,
      borrowApyPct: typeof r.borrowApy === "number" ? r.borrowApy * 100 : null,
      totalSupplyUsd: typeof r.totalSupplyUsd === "number" ? r.totalSupplyUsd : null,
      totalBorrowUsd: typeof r.totalBorrowUsd === "number" ? r.totalBorrowUsd : null,
    }));

  // Every reserve missing every rate field means the response shape
  // didn't match what this file assumes (see its own doc comment) — that
  // is a "needs verification" state, not "zero rates everywhere".
  const anyRateField = reserves.some((r) => r.supplyApyPct !== null || r.borrowApyPct !== null);
  if (reserves.length > 0 && !anyRateField) return null;

  return reserves;
}
