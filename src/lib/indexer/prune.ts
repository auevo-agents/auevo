import { getSupabaseServer } from "@/lib/supabase";

/**
 * Deletes rows out of indexer_swaps older than INDEXER_SWAPS_RETENTION_DAYS
 * (default 30) — the chain indexer (src/lib/indexer/run.ts) inserts one row
 * per on-chain Uniswap v3/v4 Swap event every 10 minutes forever
 * (0001_indexer.sql, extended by 0007_indexer_v4.sql) with no retention of
 * its own, which is exactly what grew this table to 200MB+ within weeks —
 * see the "Supabase quota" investigation this was written for.
 *
 * Every caller of this table (smart-money scanner, wallet activity feed)
 * already reads recency-ordered with a row-count LIMIT rather than
 * expecting full history, so pruning old rows doesn't change what the app
 * shows — only how much it costs to keep showing it.
 *
 * Deletes in small batches rather than one statement: a single
 * `DELETE ... WHERE block_timestamp < X` against a large table can run long
 * enough to risk the cron's own execution budget (and, worse, a lock held
 * for that whole duration) — many small, fast transactions are safer than
 * one big one on a free-tier/nano instance.
 */
const DEFAULT_RETENTION_DAYS = 30;
const BATCH_SIZE = 2000;
const TIME_BUDGET_MS = 20_000;

export async function pruneIndexerSwaps(): Promise<{ deleted: number; ranOutOfTime: boolean; retentionDays: number }> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");

  const retentionDays = Number(process.env.INDEXER_SWAPS_RETENTION_DAYS) || DEFAULT_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const start = Date.now();
  let deleted = 0;
  let ranOutOfTime = false;

  for (;;) {
    if (Date.now() - start > TIME_BUDGET_MS) {
      ranOutOfTime = true;
      break;
    }

    // inserted_at (when this app wrote the row), not block_timestamp (when
    // the swap happened on-chain) — block_timestamp can be null (a failed
    // eth_getBlockByNumber lookup, see 0001_indexer.sql's own comment), and
    // a null-timestamp row should age out with its batch, not linger
    // forever because it can never match a `< cutoff` comparison.
    // PostgREST requires an explicit order whenever limit/offset is used on
    // a write request (otherwise "offset or limit requires explicit order
    // by") — ascending id approximates insertion order closely enough for
    // a retention sweep, no need to order by the nullable block_timestamp.
    const { data, error } = await supabase
      .from("indexer_swaps")
      .delete()
      .lt("inserted_at", cutoff)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE)
      .select("id");
    if (error) throw error;

    const batchDeleted = data?.length ?? 0;
    deleted += batchDeleted;
    if (batchDeleted < BATCH_SIZE) break;
  }

  return { deleted, ranOutOfTime, retentionDays };
}
