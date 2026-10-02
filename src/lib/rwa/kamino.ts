/**
 * Kamino Finance's public lending-market API — RWA_SPEC.md Phase 8's
 * `/rwa/app/lend` ("Kamino xStocks markets через их публичный API").
 *
 * Confirmed live 2026-09-27 against real responses fetched by the user
 * from inside a real browser (this sandbox's own network egress to
 * api.kamino.finance is blocked, so every value below was verified
 * secondhand, never guessed):
 *
 * - The market list lives at `/v2/kamino-market` (not `/kamino-market/
 *   markets` — that path treats the segment after `/kamino-market/` as a
 *   pubkey and 400s on anything that isn't valid base58). The "xStocks
 *   Market" entry's `lendingMarket` field is
 *   `5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua` — this is the one
 *   `KAMINO_XSTOCKS_MARKET_PUBKEY` should be set to (two sibling markets
 *   also matched "xStocks" in the UI but are narrower: "Sentora xStocks
 *   Market" is a separate curator-run isolated market, "STRCx Market" is
 *   single-asset-only — this file targets the general one).
 * - `/kamino-market/{pubkey}/reserves/metrics` (the per-market endpoint
 *   this file actually calls) needs no `/v2` prefix — confirmed by
 *   fetching it directly with the pubkey above and getting real reserve
 *   rows back (TSLAx, NVDAx, USDC, etc.), not a 404.
 * - Every numeric field in that response (`supplyApy`, `borrowApy`,
 *   `totalSupplyUsd`, `totalBorrowUsd`) is a numeric-STRING
 *   (`"0.044395145359638066"`), not a JSON number — the original version
 *   of this file assumed `number` (an unverified guess from search-engine
 *   snippets of Kamino's docs, not a live response) and so silently
 *   parsed every rate as null forever. Fixed below.
 * - The response also carries a human-readable `liquidityToken` field
 *   (e.g. `"TSLAx"`, `"NVDAx"`) the original guess didn't know about —
 *   used now instead of showing a truncated mint address.
 */

const KAMINO_API_BASE = "https://api.kamino.finance";

export interface KaminoReserveMetrics {
  reservePubkey: string;
  liquidityToken: string;
  liquidityTokenMint: string;
  supplyApyPct: number | null;
  borrowApyPct: number | null;
  totalSupplyUsd: number | null;
  totalBorrowUsd: number | null;
}

interface RawKaminoReserve {
  reserve?: string;
  liquidityToken?: string;
  liquidityTokenMint?: string;
  // Kamino's API returns every one of these as a numeric string, not a JSON number.
  supplyApy?: string;
  borrowApy?: string;
  totalSupplyUsd?: string;
  totalBorrowUsd?: string;
}

function parseNumericPct(value: string | undefined): number | null {
  if (typeof value !== "string") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n * 100 : null;
}

function parseNumericUsd(value: string | undefined): number | null {
  if (typeof value !== "string") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
      liquidityToken: r.liquidityToken ?? `${r.liquidityTokenMint!.slice(0, 4)}…${r.liquidityTokenMint!.slice(-4)}`,
      liquidityTokenMint: r.liquidityTokenMint!,
      supplyApyPct: parseNumericPct(r.supplyApy),
      borrowApyPct: parseNumericPct(r.borrowApy),
      totalSupplyUsd: parseNumericUsd(r.totalSupplyUsd),
      totalBorrowUsd: parseNumericUsd(r.totalBorrowUsd),
    }));

  // Every reserve missing every rate field means the response shape
  // didn't match what this file assumes (see its own doc comment) — that
  // is a "needs verification" state, not "zero rates everywhere".
  const anyRateField = reserves.some((r) => r.supplyApyPct !== null || r.borrowApyPct !== null);
  if (reserves.length > 0 && !anyRateField) return null;

  return reserves;
}
