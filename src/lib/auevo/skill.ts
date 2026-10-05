import type { SupabaseClient } from "@supabase/supabase-js";

export const SKILL_MIN_WINDOW_HOURS = 1;
export const SKILL_MAX_WINDOW_HOURS = 168; // 7 days
/** Buffer so the window never asks about blocks the indexer hasn't reached yet — see src/lib/indexer/run.ts for why this can lag real time. */
export const SKILL_INDEXER_BUFFER_MS = 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;

export interface SkillWindow {
  windowEnd: Date;
  windowStart: Date;
}

/**
 * The server computes the window itself from windowHours alone — never
 * from client-supplied timestamps — so there's no ambiguity to exploit.
 *
 * windowEnd is floored to the hour (after subtracting the indexer
 * buffer, so it's still always safely in the past): two agents asking
 * about the same (dex, poolRef, windowHours) within the same hour get
 * the literal identical window, not two slightly different ones a few
 * seconds apart. That's what makes "agents compared on the same
 * question" (execution-plan doc §7) possible for Skill at all, without
 * a separate challenge-instance row to coordinate it — the shared
 * window falls out of the clock alone.
 */
export function computeSkillWindow(windowHours: number): SkillWindow {
  const safeNow = Date.now() - SKILL_INDEXER_BUFFER_MS;
  const windowEnd = new Date(Math.floor(safeNow / HOUR_MS) * HOUR_MS);
  const windowStart = new Date(windowEnd.getTime() - windowHours * 60 * 60 * 1000);
  return { windowEnd, windowStart };
}

// How far back the suggestion list looks for "is this pool actually
// trading" — deliberately separate from SKILL_MIN/MAX_WINDOW_HOURS (an
// agent's own window choice at commit time): this is just a freshness
// filter over a fixed recent lookback, not itself a skill window, and it
// is never close enough to a commit's own windowStart/windowEnd to be
// read as a hint — see listSuggestedSkillPools's own comment below.
const SUGGESTION_LOOKBACK_HOURS = 48;
// Same defensive row cap already used for an unbounded recent-swaps scan
// elsewhere (scanner/smart-money's SWAP_ROWS_LIMIT, indexer/run.ts's
// POOL_ADDRESS_FETCH_LIMIT) — large enough to see real activity, small
// enough to never time out a request.
const SUGGESTION_SWAP_ROWS_LIMIT = 5000;
const SUGGESTION_POOL_LIMIT = 15;

export type SkillPoolActivity = "light" | "active" | "hot";

export interface SuggestedSkillPool {
  dex: "uniswap_v3" | "uniswap_v4";
  poolRef: string;
  /** "TOKEN0/TOKEN1" when both legs resolve to a verified rwa_tokens symbol, else null (shown as a truncated address by the caller). */
  pairLabel: string | null;
  activity: SkillPoolActivity;
}

/** Buckets a raw SWAP-ROW count — never a unique-trader count, and never the agent's own future window — into one of three coarse labels, so nothing close to "the answer" is exposed. See listSuggestedSkillPools for the full reasoning. */
function bucketActivity(swapRows: number): SkillPoolActivity {
  if (swapRows >= 100) return "hot";
  if (swapRows >= 20) return "active";
  return "light";
}

/**
 * "Pools worth trying" for the guided Skill flow — reads the same
 * indexer_swaps/indexer_pools tables countUniqueTraders grades against,
 * just over a fixed recent lookback (SUGGESTION_LOOKBACK_HOURS) instead
 * of an agent-chosen window, so a human or agent browsing /proofs/skill
 * doesn't have to guess a pool address cold.
 *
 * Why this can't become a backdoor for the real answer: (1) it ranks and
 * displays a raw COUNT OF SWAP ROWS, never countUniqueTraders' distinct
 * sender/recipient count — the two numbers can differ arbitrarily (ten
 * swaps from one wallet vs. ten wallets trading once each look identical
 * here but very different to countUniqueTraders), so this number is not
 * a stand-in for the graded metric even read literally; (2) that
 * swap-row count is bucketed into one of three coarse labels
 * ("light"/"active"/"hot"), never shown as an exact figure, so there's
 * nothing precise to subtract a buffer from either; (3) it's computed
 * over a fixed lookback ending now, not the specific windowStart/windowEnd
 * a future commitment will actually be graded against (computeSkillWindow
 * always ends SKILL_INDEXER_BUFFER_MS before the *grading* request's own
 * time, which this list-building request can't know in advance) — so
 * even a motivated reader can't line this list's window up with the one
 * their guess will be checked against.
 */
export async function listSuggestedSkillPools(supabase: SupabaseClient): Promise<SuggestedSkillPool[]> {
  const since = new Date(Date.now() - SUGGESTION_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  const { data: swaps, error } = await supabase
    .from("indexer_swaps")
    .select("dex, pool_address, pool_id")
    .gte("block_timestamp", since)
    .order("block_number", { ascending: false })
    .limit(SUGGESTION_SWAP_ROWS_LIMIT);
  if (error) throw error;

  const byKey = new Map<string, { dex: "uniswap_v3" | "uniswap_v4"; poolRef: string; swapRows: number }>();
  for (const row of swaps ?? []) {
    const dex = row.dex as "uniswap_v3" | "uniswap_v4";
    const poolRef = (dex === "uniswap_v3" ? row.pool_address : row.pool_id) as string | null;
    if (!poolRef) continue;
    const key = `${dex}:${poolRef.toLowerCase()}`;
    const existing = byKey.get(key);
    if (existing) existing.swapRows++;
    else byKey.set(key, { dex, poolRef, swapRows: 1 });
  }

  const ranked = [...byKey.values()].sort((a, b) => b.swapRows - a.swapRows).slice(0, SUGGESTION_POOL_LIMIT);
  if (ranked.length === 0) return [];

  const v3Refs = ranked.filter((r) => r.dex === "uniswap_v3").map((r) => r.poolRef);
  const v4Refs = ranked.filter((r) => r.dex === "uniswap_v4").map((r) => r.poolRef);
  const [v3Pools, v4Pools] = await Promise.all([
    v3Refs.length
      ? supabase.from("indexer_pools").select("pool_address, token0, token1").in("pool_address", v3Refs)
      : Promise.resolve({ data: [] as { pool_address: string; token0: string; token1: string }[], error: null }),
    v4Refs.length
      ? supabase.from("indexer_pools").select("pool_id, token0, token1").in("pool_id", v4Refs)
      : Promise.resolve({ data: [] as { pool_id: string; token0: string; token1: string }[], error: null }),
  ]);
  if (v3Pools.error) throw v3Pools.error;
  if (v4Pools.error) throw v4Pools.error;

  // Same opaque-key normalization scanner/smart-money already uses for a
  // mixed v3 (pool_address) / v4 (pool_id) join.
  const tokensByKey = new Map<string, { token0: string; token1: string }>();
  for (const p of v3Pools.data ?? []) tokensByKey.set(`uniswap_v3:${p.pool_address.toLowerCase()}`, { token0: p.token0, token1: p.token1 });
  for (const p of v4Pools.data ?? []) tokensByKey.set(`uniswap_v4:${p.pool_id.toLowerCase()}`, { token0: p.token0, token1: p.token1 });

  // Best-effort "TICKER/TICKER" label from whatever side(s) are verified
  // rwa_tokens — same join scanner/smart-money already does to attribute
  // a raw indexer_pools token0/token1 pair to a human-readable ticker.
  // Indexer tables carry only raw addresses, so a pool with no verified
  // leg (e.g. two unlisted tokens) simply gets no label — not invented.
  const allAddresses = [...new Set([...tokensByKey.values()].flatMap((t) => [t.token0, t.token1]))];
  const { data: rwaRows, error: rwaError } = allAddresses.length
    ? await supabase.from("rwa_tokens").select("address, symbol").in("address", allAddresses)
    : { data: [] as { address: string; symbol: string }[], error: null };
  if (rwaError) throw rwaError;
  const symbolByAddress = new Map((rwaRows ?? []).map((r) => [r.address.toLowerCase(), r.symbol]));

  // Only pools confirmed present in indexer_pools — swap rows alone can
  // reference a pool indexer_pools hasn't caught up to (or never will),
  // and poolExists() (checked before accepting a commitment) reads only
  // indexer_pools. Suggesting a pool that would then fail that check is
  // worse than not suggesting it at all.
  return ranked
    .filter((r) => tokensByKey.has(`${r.dex}:${r.poolRef.toLowerCase()}`))
    .map((r) => {
      const tokens = tokensByKey.get(`${r.dex}:${r.poolRef.toLowerCase()}`);
      const sym0 = tokens ? symbolByAddress.get(tokens.token0.toLowerCase()) : undefined;
      const sym1 = tokens ? symbolByAddress.get(tokens.token1.toLowerCase()) : undefined;
      return {
        dex: r.dex,
        poolRef: r.poolRef,
        pairLabel: sym0 && sym1 ? `${sym0}/${sym1}` : null,
        activity: bucketActivity(r.swapRows),
      };
    });
}

/** True if this exact (dex, pool) pair is one our indexer actually knows about — checked before accepting a commitment, so a typo'd or nonexistent pool is rejected at submit time rather than drifting into an unverifiable Proof later. */
export async function poolExists(supabase: SupabaseClient, dex: "uniswap_v3" | "uniswap_v4", poolRef: string): Promise<boolean> {
  const column = dex === "uniswap_v3" ? "pool_address" : "pool_id";
  const { data, error } = await supabase.from("indexer_pools").select(column).eq("dex", dex).eq(column, poolRef).limit(1).maybeSingle();
  if (error) throw error;
  return !!data;
}

/**
 * Same v3/v4 attribution split src/lib/auevo/economic-activity.ts and
 * /api/wallets/[address]/activity already use: v3 swaps attribute to
 * either sender or recipient; a v4 row's `recipient` column already
 * holds the enclosing tx's `from` (v4's Swap event has no recipient
 * field at all — see indexer/scan-v4.ts), so only that column is read.
 */
export async function countUniqueTraders(
  supabase: SupabaseClient,
  dex: "uniswap_v3" | "uniswap_v4",
  poolRef: string,
  window: SkillWindow
): Promise<number> {
  const poolColumn = dex === "uniswap_v3" ? "pool_address" : "pool_id";
  // Always select both columns (the select string's shape must stay
  // static for postgrest-js's type inference) — only `recipient` is read
  // for a v4 row below, same v3/v4 split economic-activity.ts uses.
  const { data, error } = await supabase
    .from("indexer_swaps")
    .select("sender, recipient")
    .eq("dex", dex)
    .eq(poolColumn, poolRef)
    .gte("block_timestamp", window.windowStart.toISOString())
    .lt("block_timestamp", window.windowEnd.toISOString());
  if (error) throw error;

  const traders = new Set<string>();
  for (const row of data ?? []) {
    if (dex === "uniswap_v3" && row.sender) traders.add((row.sender as string).toLowerCase());
    if (row.recipient) traders.add((row.recipient as string).toLowerCase());
  }
  return traders.size;
}
