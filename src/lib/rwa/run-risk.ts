import type { Address } from "viem";
import { getSupabaseServer } from "@/lib/supabase";
import { scanTokenRiskByChain } from "./risk";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // rescan a token at most once a day
const MAX_SCANS_PER_RUN = 15; // each scan is several sequential RPC calls across up to two addresses (proxy + implementation) — bounded to stay well inside a cron route's own time budget

/**
 * RWA_SPEC.md Phase 5's risk-scoring cron — scans rwa_tokens' contracts
 * (src/lib/rwa/risk.ts) and upserts the result into rwa_risk. Only the
 * fields rwa_risk's own schema (0003_rwa.sql) gives a dedicated column to
 * are written there directly; every other field from the scan (canMint,
 * canFreeze, proxy details, the matched-signature evidence per finding)
 * lives in `raw` — that column's own comment in the migration says why:
 * "the score's 'why' the UI explains itself from this, not a black box."
 *
 * Rescans the most stale (or never-scanned) tokens first each run, same
 * "always make forward progress within a time budget" shape as
 * run-registry.ts/run-prices.ts, so a slow RPC on one chain never starves
 * every other chain's tokens of ever being scanned.
 */
export interface RiskRunResult {
  status: "ok" | "skipped";
  reason?: string;
  due?: number;
  scanned?: number;
  failed?: number;
}

export async function runRiskPass(): Promise<RiskRunResult> {
  const supabase = getSupabaseServer();
  if (!supabase) return { status: "skipped", reason: "Supabase not configured" };

  const { data: tokens, error: tokensError } = await supabase.from("rwa_tokens").select("chain_id, address").eq("verified", true);
  if (tokensError) throw new Error(`Could not read rwa_tokens: ${tokensError.message}`);
  if (!tokens || tokens.length === 0) return { status: "ok", due: 0, scanned: 0, failed: 0 };

  const { data: existing, error: riskError } = await supabase.from("rwa_risk").select("chain_id, token_address, checked_at");
  if (riskError) throw new Error(`Could not read rwa_risk: ${riskError.message}`);

  const checkedAtByKey = new Map((existing ?? []).map((r) => [`${r.chain_id}:${r.token_address.toLowerCase()}`, Date.parse(r.checked_at)]));
  const now = Date.now();

  const due = tokens
    .map((t) => ({ ...t, lastChecked: checkedAtByKey.get(`${t.chain_id}:${t.address.toLowerCase()}`) ?? 0 }))
    .filter((t) => now - t.lastChecked > STALE_AFTER_MS)
    .sort((a, b) => a.lastChecked - b.lastChecked) // never-scanned (0) and oldest first
    .slice(0, MAX_SCANS_PER_RUN);

  let scanned = 0;
  let failed = 0;

  for (const token of due) {
    try {
      const result = await scanTokenRiskByChain(token.chain_id, token.address as Address);
      const { error } = await supabase.from("rwa_risk").upsert(
        {
          chain_id: token.chain_id,
          token_address: token.address,
          admin_address: result.adminAddress,
          upgradeable: result.upgradeable,
          can_pause: result.canPause,
          can_blacklist: result.canBlacklist,
          can_force_transfer: result.canForceTransfer,
          can_burn_others: result.canBurnOthers,
          mint_role_holders: result.mintRoleHolders,
          score: result.isContract ? result.score : null,
          checked_at: result.checkedAt,
          raw: result,
        },
        { onConflict: "chain_id,token_address" }
      );
      if (error) throw new Error(`rwa_risk upsert failed for ${token.chain_id}:${token.address}: ${error.message}`);
      scanned++;
    } catch {
      // One token's RPC failing (dead node, chain-specific quirk) should
      // never stop the rest of the run — it just stays stale and is
      // retried next pass, same as a failed scan anywhere else in this app.
      failed++;
    }
  }

  return { status: "ok", due: due.length, scanned, failed };
}
