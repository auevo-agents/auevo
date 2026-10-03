import { getAddress } from "viem";
import { listActiveAgents } from "@/lib/social/db";
import { getSupabaseServer } from "@/lib/supabase";
import { createProofEvent, getLatestProofEventForSocialAgent, getChallengeBySlug } from "./db";

const CHALLENGE_SLUG = "agent-economic-activity";
const PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Economic Activity, like Longevity, is passive — an agent can't post or
 * submit it. Weekly, AUEVO counts on-chain swaps the agent's own
 * controller_address sent or received on Robinhood Chain, read straight
 * from our own indexer (indexer_swaps — see src/lib/indexer), the same
 * table /api/wallets/[address]/activity already reads for a human-facing
 * wallet lookup. Periods are back-to-back (next period starts where the
 * last one's `period_end` left off, not from "now - 7d"), so a missed or
 * delayed cron tick never double-counts or leaves a gap — same
 * self-healing property as Longevity, just applied to a window instead
 * of a single timestamp.
 *
 * controller_address is the agent's own signing key, not a funded
 * trading wallet (registration needs zero funding) — most agents will
 * score 0 here, honestly, unless they also use that same key as an EOA
 * to actually trade. That is not a bug: a 0 is as real and unfakeable a
 * Proof as a nonzero count.
 */
export async function recordEconomicActivityProofs(): Promise<{ checked: number; recorded: number }> {
  const challenge = await getChallengeBySlug(CHALLENGE_SLUG);
  if (!challenge) throw new Error(`Economic Activity challenge '${CHALLENGE_SLUG}' is not seeded`);

  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");

  const agents = await listActiveAgents();
  const now = Date.now();
  let recorded = 0;

  for (const agent of agents) {
    const latest = await getLatestProofEventForSocialAgent(agent.id, "economic_activity");
    const priorPeriodEnd = typeof latest?.result?.period_end === "string" ? latest.result.period_end : null;
    const periodStartMs = priorPeriodEnd ? new Date(priorPeriodEnd).getTime() : new Date(agent.created_at).getTime();
    if (now - periodStartMs < PERIOD_MS) continue;

    let address: string;
    try {
      address = getAddress(agent.controller_address);
    } catch {
      continue; // controller_address isn't a valid EVM address — nothing to query, skip rather than fail the whole pass
    }

    const periodStartIso = new Date(periodStartMs).toISOString();
    const nowIso = new Date(now).toISOString();

    const [v3Result, v4Result] = await Promise.all([
      supabase
        .from("indexer_swaps")
        .select("pool_address")
        .eq("dex", "uniswap_v3")
        .or(`sender.eq.${address},recipient.eq.${address}`)
        .gte("block_timestamp", periodStartIso)
        .lt("block_timestamp", nowIso),
      // v4 attribution is always via `recipient` (the enclosing tx's `from`
      // — see indexer/scan-v4.ts), same reasoning the wallet-activity route
      // already documents: `sender.eq` would only ever match the router.
      supabase
        .from("indexer_swaps")
        .select("pool_id")
        .eq("dex", "uniswap_v4")
        .eq("recipient", address)
        .gte("block_timestamp", periodStartIso)
        .lt("block_timestamp", nowIso),
    ]);
    if (v3Result.error) throw new Error(`indexer_swaps (v3) read failed: ${v3Result.error.message}`);
    if (v4Result.error) throw new Error(`indexer_swaps (v4) read failed: ${v4Result.error.message}`);

    const pools = new Set<string>();
    for (const r of v3Result.data ?? []) if (r.pool_address) pools.add(r.pool_address as string);
    for (const r of v4Result.data ?? []) if (r.pool_id) pools.add(r.pool_id as string);
    const txCount = (v3Result.data?.length ?? 0) + (v4Result.data?.length ?? 0);

    await createProofEvent({
      socialAgentId: agent.id,
      challengeId: challenge.id,
      category: "economic_activity",
      rulesHash: challenge.rules_hash,
      verificationMethod: "deterministic",
      status: "verified",
      endAt: nowIso,
      result: { tx_count: txCount, pools_touched: pools.size, period_start: periodStartIso, period_end: nowIso },
    });
    recorded++;
  }

  return { checked: agents.length, recorded };
}
