import { getSupabaseServer } from "@/lib/supabase";
import { getProofEventByTaskId, updateProofEvent } from "@/lib/auevo/db";

const BATCH_SIZE = 100;

interface PendingEventBet {
  post_id: string;
  market_id: string;
  chosen_outcome: string;
}

interface ResolvedMarket {
  id: string;
  closed: boolean;
  resolved_outcome: string | null;
}

/**
 * Same mirror-the-verdict pattern as verify-claims.ts's own
 * mirrorVerdictToProofEvent (private there, re-implemented here rather
 * than exported across an unrelated module boundary) — best-effort, a
 * failure here must never break event-bet settlement itself.
 */
async function mirrorVerdictToProofEvent(postId: string, status: "verified" | "disputed", resultPatch: Record<string, unknown>): Promise<void> {
  try {
    const proof = await getProofEventByTaskId(postId);
    if (!proof) return;
    await updateProofEvent(proof.id, {
      status,
      endAt: new Date().toISOString(),
      result: { ...proof.result, ...resultPatch },
    });
  } catch (err) {
    console.error("Failed to mirror event bet verdict to AUEVO Proof Event", postId, err);
  }
}

/**
 * Settles every agent_event_bets row still 'pending' whose market has
 * since closed with a resolved_outcome in our own auevo_markets cache
 * (kept fresh by src/lib/auevo/polymarket.ts's syncPolymarketMarkets,
 * run just before this in src/app/api/cron/auevo-polymarket-sync). The
 * settlement source is Polymarket's own market resolution — this
 * function only ever reads our cache of it, never computes a verdict
 * itself.
 */
export async function verifyDueEventBets(): Promise<{ checked: number; correct: number; incorrect: number; unverifiable: number }> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");

  const { data: due, error } = await supabase
    .from("agent_event_bets")
    .select("post_id, market_id, chosen_outcome")
    .eq("verdict", "pending")
    .limit(BATCH_SIZE);
  if (error) throw error;

  const bets = (due ?? []) as PendingEventBet[];
  let correct = 0;
  let incorrect = 0;
  const unverifiable = 0; // agent_event_bets has no "unverifiable" path today — a market either hasn't resolved yet (left pending) or has
  let checked = 0;

  if (bets.length === 0) return { checked: 0, correct: 0, incorrect: 0, unverifiable: 0 };

  const marketIds = [...new Set(bets.map((b) => b.market_id))];
  const { data: markets, error: marketsError } = await supabase
    .from("auevo_markets")
    .select("id, closed, resolved_outcome")
    .in("id", marketIds)
    .eq("closed", true)
    .not("resolved_outcome", "is", null);
  if (marketsError) throw marketsError;

  const resolvedById = new Map((markets as ResolvedMarket[] | null ?? []).map((m) => [m.id, m]));

  for (const bet of bets) {
    const market = resolvedById.get(bet.market_id);
    if (!market || !market.resolved_outcome) continue; // not resolved yet — leave pending for a later pass
    checked++;
    const met = bet.chosen_outcome === market.resolved_outcome;
    if (met) correct++;
    else incorrect++;
    await supabase
      .from("agent_event_bets")
      .update({ verdict: met ? "correct" : "incorrect", resolved_outcome: market.resolved_outcome, verified_at: new Date().toISOString() })
      .eq("post_id", bet.post_id);
    await mirrorVerdictToProofEvent(bet.post_id, met ? "verified" : "disputed", {
      verdict: met ? "correct" : "incorrect",
      resolvedOutcome: market.resolved_outcome,
    });
  }

  return { checked, correct, incorrect, unverifiable };
}
