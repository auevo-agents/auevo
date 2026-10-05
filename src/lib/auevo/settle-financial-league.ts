import { getRobinhoodClient } from "@/lib/evm/client";
import { ERC20_ABI } from "@/lib/erc20-abi";
import { fetchTokenPricesUsd } from "@/lib/rwa/gecko-price";
import {
  listCohortsDueForSettlement,
  listEntriesForCohort,
  markCohortStatus,
  updateProofEvent,
  type FinancialLeagueCohort,
} from "./db";

/**
 * Settles every Financial Agent League cohort past its ends_at — reads
 * each entrant's operator wallet balance live off Robinhood Chain and
 * the benchmark's current price, computes return/benchmark-return/alpha
 * deterministically, and writes it into that entry's already-existing
 * Proof Event (created at entry time — see the enter route). No
 * validator, no human judgment: this is design doc §13's "deterministic
 * verification" tier, the only one the MVP needs.
 */
export async function settleDueFinancialLeagueCohorts(): Promise<{ settled: number; entries: number }> {
  const cohorts = await listCohortsDueForSettlement();
  let entriesSettled = 0;

  for (const cohort of cohorts) {
    await settleCohort(cohort);
    const entries = await listEntriesForCohort(cohort.id);
    entriesSettled += entries.length;
  }

  return { settled: cohorts.length, entries: entriesSettled };
}

async function settleCohort(cohort: FinancialLeagueCohort): Promise<void> {
  const client = getRobinhoodClient();

  let settlementBenchmarkPrice = 0;
  if (cohort.benchmark_chain_id && cohort.benchmark_token_address) {
    const prices = await fetchTokenPricesUsd(cohort.benchmark_chain_id, [cohort.benchmark_token_address]);
    settlementBenchmarkPrice = prices.get(cohort.benchmark_token_address.toLowerCase()) ?? 0;
  }

  const decimals = await client.readContract({
    address: cohort.asset_address as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "decimals",
  });

  const entries = await listEntriesForCohort(cohort.id);
  for (const entry of entries) {
    if (!entry.proof_event_id) continue; // shouldn't happen — enter() always sets this

    const balanceRaw = await client.readContract({
      address: cohort.asset_address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [entry.operator_wallet as `0x${string}`],
    });
    const finalBalance = Number(balanceRaw) / 10 ** decimals;

    const startBalance = entry.entry_operator_balance ? Number(entry.entry_operator_balance) : null;
    const startBenchmark = entry.entry_benchmark_price ? Number(entry.entry_benchmark_price) : null;

    const returnPct = startBalance && startBalance > 0 ? ((finalBalance - startBalance) / startBalance) * 100 : null;
    const benchmarkReturnPct =
      startBenchmark && startBenchmark > 0 ? ((settlementBenchmarkPrice - startBenchmark) / startBenchmark) * 100 : null;
    const alphaPct = returnPct !== null && benchmarkReturnPct !== null ? returnPct - benchmarkReturnPct : null;
    // alphaPct is only null when the operator or benchmark balance couldn't
    // be read (startBalance/startBenchmark missing) — a real settlement
    // failure, not a beaten-or-not-beaten benchmark, so it's inconclusive
    // rather than silently counted as a pass or fail.
    const status = alphaPct === null ? "inconclusive" : alphaPct >= 0 ? "passed" : "failed";

    await updateProofEvent(entry.proof_event_id, {
      status,
      endAt: new Date().toISOString(),
      result: {
        cohort_id: cohort.id,
        entry_id: entry.id,
        start_balance: startBalance,
        final_balance: finalBalance,
        return_pct: returnPct,
        benchmark_return_pct: benchmarkReturnPct,
        alpha_pct: alphaPct,
      },
    });
  }

  await markCohortStatus(cohort.id, "settled", settlementBenchmarkPrice);
}
