import { getSupabaseServer } from "@/lib/supabase";

/**
 * Polymarket's public Gamma API (https://gamma-api.polymarket.com) — no
 * auth needed, confirmed by direct curl. Used only by
 * syncPolymarketMarkets (a cron, src/app/api/cron/auevo-polymarket-sync),
 * never fetched live on page load — the catalog this app shows always
 * reads the auevo_markets cache this file writes.
 */

const GAMMA_BASE = "https://gamma-api.polymarket.com";

// Below this liquidity, a market is thin enough that its listed price
// barely reflects real conviction and the catalog would end up full of
// dead/illiquid questions. $1,000 is a low but real floor — Polymarket's
// own UI treats markets far below this as inactive in practice.
const MIN_LIQUIDITY_USD = 1_000;

// A market ending in under an hour gives an agent no real window to
// commit to before the outcome is already effectively known — not a
// meaningful prediction, just a coin flip on timing.
const MIN_TIME_TO_END_MS = 60 * 60 * 1000;

const FETCH_LIMIT = 60;
const FETCH_TIMEOUT_MS = 10_000;

export interface PolymarketMarket {
  id: string;
  slug: string;
  question: string;
  category: string | null;
  outcomes: string[];
  outcomePrices: string[];
  endDate: string;
  volume24hr: number | null;
  liquidity: number | null;
  active: boolean;
  closed: boolean;
}

interface RawGammaMarket {
  id: string;
  slug: string;
  question: string;
  category?: string | null;
  outcomes?: string; // JSON-encoded string, e.g. '["Yes","No"]'
  outcomePrices?: string; // JSON-encoded string, e.g. '["0.42","0.58"]'
  endDate?: string;
  volume24hr?: number | string | null;
  liquidity?: number | string | null;
  active?: boolean;
  closed?: boolean;
}

function parseJsonArray(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
}

function toNumberOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalize(raw: RawGammaMarket): PolymarketMarket | null {
  const outcomes = parseJsonArray(raw.outcomes);
  const outcomePrices = parseJsonArray(raw.outcomePrices);
  if (!raw.id || !raw.slug || !raw.question || !raw.endDate || outcomes.length === 0) return null;
  return {
    id: String(raw.id),
    slug: raw.slug,
    question: raw.question,
    category: raw.category ?? null,
    outcomes,
    outcomePrices,
    endDate: raw.endDate,
    volume24hr: toNumberOrNull(raw.volume24hr),
    liquidity: toNumberOrNull(raw.liquidity),
    active: raw.active ?? true,
    closed: raw.closed ?? false,
  };
}

async function fetchGamma(params: string): Promise<RawGammaMarket[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${GAMMA_BASE}/markets?${params}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? (json as RawGammaMarket[]) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The open-markets catalog: active, not closed, ranked by 24h volume —
 * confirmed working with no auth (`?active=true&closed=false&order=
 * volume24hr&ascending=false&limit=60`). Filters out markets below
 * MIN_LIQUIDITY_USD and markets ending in under MIN_TIME_TO_END_MS.
 */
export async function fetchPolymarketMarkets(): Promise<PolymarketMarket[]> {
  const raw = await fetchGamma(`active=true&closed=false&order=volume24hr&ascending=false&limit=${FETCH_LIMIT}`);
  const now = Date.now();
  const out: PolymarketMarket[] = [];
  for (const r of raw) {
    const m = normalize(r);
    if (!m) continue;
    if ((m.liquidity ?? 0) < MIN_LIQUIDITY_USD) continue;
    const endMs = new Date(m.endDate).getTime();
    if (!Number.isFinite(endMs) || endMs - now < MIN_TIME_TO_END_MS) continue;
    out.push(m);
  }
  return out;
}

/**
 * Re-checks markets our own cache still has as closed=false but whose
 * end_date has already passed (or is within a day of passing) — these
 * may have resolved on Polymarket's side since our last sync. Confirmed
 * empirically: `?closed=true&id=<id>&id=<id>...` returns only the subset
 * of the given ids that Polymarket now reports as closed, so this is one
 * batched request rather than one per market.
 */
async function fetchClosedAmong(ids: string[]): Promise<RawGammaMarket[]> {
  if (ids.length === 0) return [];
  const idParams = ids.map((id) => `id=${encodeURIComponent(id)}`).join("&");
  return fetchGamma(`closed=true&${idParams}`);
}

function resolvedOutcomeOf(m: PolymarketMarket): string | null {
  const idx = m.outcomePrices.findIndex((p) => Number(p) === 1);
  return idx >= 0 ? m.outcomes[idx] ?? null : null;
}

export interface SyncResult {
  fetched: number;
  upserted: number;
  recheckedCandidates: number;
  newlyClosed: number;
}

/**
 * Fetches the current open-markets catalog and upserts it into
 * auevo_markets, then separately re-checks cached markets that are
 * close to (or past) their end_date but still closed=false in our
 * cache, in case Polymarket has resolved them since. Called by
 * src/app/api/cron/auevo-polymarket-sync, hourly.
 */
export async function syncPolymarketMarkets(): Promise<SyncResult> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");

  const markets = await fetchPolymarketMarkets();
  let upserted = 0;
  if (markets.length > 0) {
    const rows = markets.map((m) => ({
      id: m.id,
      slug: m.slug,
      question: m.question,
      category: m.category,
      outcomes: m.outcomes,
      outcome_prices: m.outcomePrices,
      end_date: m.endDate,
      volume_24hr: m.volume24hr,
      liquidity: m.liquidity,
      active: m.active,
      closed: m.closed,
      synced_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("auevo_markets").upsert(rows, { onConflict: "id" });
    if (error) throw error;
    upserted = rows.length;
  }

  // Candidates for a resolution re-check: our own cache's closed=false
  // rows whose end_date is already in the past — not the whole table.
  const { data: candidates, error: candErr } = await supabase
    .from("auevo_markets")
    .select("id")
    .eq("closed", false)
    .lte("end_date", new Date().toISOString())
    .limit(100);
  if (candErr) throw candErr;

  const candidateIds = (candidates ?? []).map((r) => r.id as string);
  const nowClosed = await fetchClosedAmong(candidateIds);
  let newlyClosed = 0;
  for (const raw of nowClosed) {
    const m = normalize(raw);
    if (!m) continue;
    const resolvedOutcome = resolvedOutcomeOf(m);
    const { error } = await supabase
      .from("auevo_markets")
      .update({
        outcome_prices: m.outcomePrices,
        active: m.active,
        closed: true,
        resolved_outcome: resolvedOutcome,
        synced_at: new Date().toISOString(),
      })
      .eq("id", m.id);
    if (error) throw error;
    newlyClosed++;
  }

  return { fetched: markets.length, upserted, recheckedCandidates: candidateIds.length, newlyClosed };
}
