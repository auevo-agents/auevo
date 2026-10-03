import type { SupabaseClient } from "@supabase/supabase-js";

export const SKILL_MIN_WINDOW_HOURS = 1;
export const SKILL_MAX_WINDOW_HOURS = 168; // 7 days
/** Buffer so the window never asks about blocks the indexer hasn't reached yet — see src/lib/indexer/run.ts for why this can lag real time. */
export const SKILL_INDEXER_BUFFER_MS = 60 * 60 * 1000;

export interface SkillWindow {
  windowEnd: Date;
  windowStart: Date;
}

/** The server computes the window itself from windowHours alone — never from client-supplied timestamps — so there's no ambiguity to exploit. */
export function computeSkillWindow(windowHours: number): SkillWindow {
  const windowEnd = new Date(Date.now() - SKILL_INDEXER_BUFFER_MS);
  const windowStart = new Date(windowEnd.getTime() - windowHours * 60 * 60 * 1000);
  return { windowEnd, windowStart };
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
