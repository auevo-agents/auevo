import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase";
import { fetchTokenPricesUsd } from "@/lib/rwa/gecko-price";
import { createProofEvent, getChallengeBySlug, getProofEventByTaskId, updateProofEvent } from "@/lib/auevo/db";
import { SPY_ADDRESS, SPY_CHAIN_ID } from "@/app/proofs/spy";

/**
 * Financial's "virtual portfolio" (execution-plan doc §1/§4) — the first
 * release's stand-in for the real, on-chain Financial Agent League
 * (db.ts's `FinancialLeagueCohort`/§4a), which needs a registered
 * AgentIdentity and real operator funds neither a hosted agent nor a
 * first-time user has. One fixed asset (SPY — the same tracked token
 * Prediction already uses), one allocation decision, one fixed fee
 * model, settled later against a real price — never mixed with real
 * capital, and always surfaced as "Simulation".
 */
export const VIRTUAL_PORTFOLIO_STARTING_BALANCE_USD = 10_000;
/** A flat, published fee on both the entry and exit trade — "a fee model set in advance", never invented per-run. */
export const VIRTUAL_PORTFOLIO_FEE_BPS = 10;
export const VIRTUAL_PORTFOLIO_HORIZON_HOURS = 24;

export class VirtualPortfolioSubmitError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface SubmitVirtualPortfolioAttemptInput {
  supabase: SupabaseClient;
  agentId: string;
  topic: string;
  body: string;
  allocationPct: unknown;
}

export interface VirtualPortfolioAttemptOutcome {
  allocationPct: number;
  entryPrice: number;
  closesAt: string;
}

export interface SubmitVirtualPortfolioAttemptResult {
  post: { id: string; agent_id: string; topic: string; body: string; parent_id: string | null; kind: string; created_at: string };
  attempt: VirtualPortfolioAttemptOutcome;
  proofEventId: string | null;
}

/**
 * The one submission path for a virtual-portfolio attempt — shared by a
 * future external/signed route and AUEVO's own executor
 * (runFinancialChallenge, executor.ts), same one-grading-path reasoning
 * as submitSkillAttempt/submitClaimAttempt (src/lib/auevo/submit.ts).
 */
export async function submitVirtualPortfolioAttempt(input: SubmitVirtualPortfolioAttemptInput): Promise<SubmitVirtualPortfolioAttemptResult> {
  const { supabase, agentId, topic, body } = input;
  const allocationPct = Number(input.allocationPct);
  if (!Number.isFinite(allocationPct) || allocationPct < 0 || allocationPct > 100) {
    throw new VirtualPortfolioSubmitError("allocationPct must be a number between 0 and 100");
  }

  const prices = await fetchTokenPricesUsd(SPY_CHAIN_ID, [SPY_ADDRESS]);
  const entryPrice = prices.get(SPY_ADDRESS.toLowerCase());
  if (!entryPrice) throw new VirtualPortfolioSubmitError("No live SPY price available right now — try again later", 503);

  const closesAt = new Date(Date.now() + VIRTUAL_PORTFOLIO_HORIZON_HOURS * 60 * 60 * 1000);

  const { data: post, error: postError } = await supabase
    .from("agent_posts")
    .insert({ agent_id: agentId, topic, body, parent_id: null, kind: "financial" })
    .select("id, agent_id, topic, body, parent_id, kind, created_at")
    .single();
  if (postError) throw postError;

  const { error: runError } = await supabase.from("auevo_virtual_portfolio_runs").insert({
    post_id: post.id,
    agent_id: agentId,
    asset_address: SPY_ADDRESS.toLowerCase(),
    chain_id: SPY_CHAIN_ID,
    starting_balance_usd: VIRTUAL_PORTFOLIO_STARTING_BALANCE_USD,
    allocation_pct: allocationPct,
    fee_bps: VIRTUAL_PORTFOLIO_FEE_BPS,
    entry_price: entryPrice,
    closes_at: closesAt.toISOString(),
  });
  if (runError) {
    await supabase.from("agent_posts").delete().eq("id", post.id);
    throw runError;
  }

  // Committed now, pending — never only after the result lands (design doc §17).
  let proofEventId: string | null = null;
  try {
    const challenge = await getChallengeBySlug("virtual-portfolio-financial");
    if (challenge) {
      const commitment = createHash("sha256")
        .update(JSON.stringify({ asset: SPY_ADDRESS, chainId: SPY_CHAIN_ID, allocationPct, entryPrice, closesAt: closesAt.toISOString() }))
        .digest("hex");
      const proofEvent = await createProofEvent({
        socialAgentId: agentId,
        taskId: post.id,
        challengeId: challenge.id,
        category: "financial_performance",
        rulesHash: challenge.rules_hash,
        commitment,
        verificationMethod: "deterministic",
        status: "awaiting_settlement",
        result: {
          simulation: true,
          asset: SPY_ADDRESS,
          chain_id: SPY_CHAIN_ID,
          starting_balance_usd: VIRTUAL_PORTFOLIO_STARTING_BALANCE_USD,
          allocation_pct: allocationPct,
          fee_bps: VIRTUAL_PORTFOLIO_FEE_BPS,
          entry_price: entryPrice,
          closes_at: closesAt.toISOString(),
        },
      });
      proofEventId = proofEvent.id;
    }
  } catch (proofErr) {
    console.error("Failed to create AUEVO Proof Event for virtual portfolio attempt", post.id, proofErr);
  }

  return { post, attempt: { allocationPct, entryPrice, closesAt: closesAt.toISOString() }, proofEventId };
}

/**
 * Settles every virtual-portfolio run whose window has closed: fetches
 * SPY's real price now, computes the agent's net return (its allocation,
 * net of the fixed fee on both trades) against a 100%-allocated
 * buy-and-hold benchmark over the exact same window and fee model.
 * Mirrors the Proof Event the same way verify-claims.ts does for a claim.
 * `max_drawdown` and `turnover` are deliberately NOT invented here: this
 * protocol has no price-history sampler yet (only a live "now" read), so
 * a path-dependent metric like drawdown genuinely cannot be computed from
 * two price points — the result object says so explicitly rather than
 * fabricating a number, same "Classification unavailable" honesty the
 * doc asks for elsewhere.
 */
export async function settleDueVirtualPortfolios(): Promise<{ checked: number; passed: number; failed: number; inconclusive: number }> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");

  const { data: due, error } = await supabase
    .from("auevo_virtual_portfolio_runs")
    .select("id, post_id, asset_address, chain_id, starting_balance_usd, allocation_pct, fee_bps, entry_price")
    .eq("status", "open")
    .lte("closes_at", new Date().toISOString())
    .limit(100);
  if (error) throw error;

  const runs = due ?? [];
  let passed = 0;
  let failed = 0;
  let inconclusive = 0;

  const byChain = new Map<number, typeof runs>();
  for (const run of runs) {
    const list = byChain.get(run.chain_id) ?? [];
    list.push(run);
    byChain.set(run.chain_id, list);
  }

  for (const [chainId, chainRuns] of byChain) {
    const addresses = [...new Set(chainRuns.map((r) => r.asset_address as string))];
    const prices = await fetchTokenPricesUsd(chainId, addresses);

    for (const run of chainRuns) {
      const exitPrice = prices.get((run.asset_address as string).toLowerCase());
      if (exitPrice === undefined) continue; // left open — retried on the next cron tick, same as an unavailable price for a claim

      const feeFrac = (run.fee_bps as number) / 10_000;
      const allocFrac = (run.allocation_pct as number) / 100;
      const priceReturn = (exitPrice - (run.entry_price as number)) / (run.entry_price as number);
      // Net return = allocated share's price return, minus the fixed fee
      // charged once on entry and once on exit, on the allocated notional
      // only (the unallocated share stays simulated cash, no fee).
      const netReturnPct = (allocFrac * priceReturn - allocFrac * feeFrac * 2) * 100;
      const benchmarkReturnPct = (priceReturn - feeFrac * 2) * 100; // the 100%-allocated, same-fee benchmark

      let verdict: "passed" | "failed" | "inconclusive";
      if (Math.abs(netReturnPct - benchmarkReturnPct) < 1e-9) verdict = "inconclusive";
      else verdict = netReturnPct > benchmarkReturnPct ? "passed" : "failed";

      if (verdict === "passed") passed++;
      else if (verdict === "failed") failed++;
      else inconclusive++;

      await supabase
        .from("auevo_virtual_portfolio_runs")
        .update({ exit_price: exitPrice, closed_at: new Date().toISOString(), status: "closed", net_return_pct: netReturnPct, benchmark_return_pct: benchmarkReturnPct, verdict })
        .eq("id", run.id);

      try {
        const proof = await getProofEventByTaskId(run.post_id as string);
        if (proof) {
          await updateProofEvent(proof.id, {
            status: verdict,
            endAt: new Date().toISOString(),
            result: {
              ...proof.result,
              exit_price: exitPrice,
              net_return_pct: netReturnPct,
              benchmark_return_pct: benchmarkReturnPct,
              verdict,
              trades: 2,
              max_drawdown: "not available — no intra-window price history sampler yet",
            },
          });
        }
      } catch (proofErr) {
        console.error("Failed to mirror virtual portfolio verdict to AUEVO Proof Event", run.post_id, proofErr);
      }
    }
  }

  return { checked: runs.length, passed, failed, inconclusive };
}
