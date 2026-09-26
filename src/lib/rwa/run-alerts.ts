import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase";
import { robinhoodChain } from "@/lib/chains";
import { loadTickerTokens } from "./scanner-data";
import { USDG } from "./dex/addresses";
import { sendTelegramMessage } from "./telegram";
import { checkPremiumAlerts, checkListingAlerts, checkWhaleAlerts, type AlertRow, type FiredAlert } from "./alerts";
import { withFetchRetry } from "./db-retry";

/**
 * RWA_SPEC.md Phase 8's alert-evaluation pass. Runs once per
 * `/api/cron/rwa-alerts` invocation — daily, the same Vercel Hobby-plan
 * cron-frequency ceiling documented in vercel.json/run-prices.ts's own
 * history, so alerts here are "checked once a day," not real-time. Every
 * fired event is deduped by (alert_id, dedupe_key) at the database level
 * (0009_rwa_alerts.sql's own unique constraint) — this function doesn't
 * need to track "have I seen this before" itself, it just tries to
 * insert and treats a conflict as "already delivered."
 */

// Slightly wider than the cron's own daily cadence so a slow or delayed
// run never has a gap where a listing/trade falls between two passes
// unseen — overlap is safe because dedupe is keyed by address/tx_hash,
// not by time.
const LOOKBACK_HOURS = 25;

export interface AlertsRunResult {
  status: "ok" | "skipped";
  reason?: string;
  evaluated?: number;
  fired?: number;
  delivered?: { web: number; telegram: number };
}

async function loadAlerts(supabase: SupabaseClient): Promise<AlertRow[]> {
  const { data, error } = await withFetchRetry(() => supabase.from("alerts").select("id, account, type, params, channel"));
  if (error) throw new Error(`Could not read alerts: ${error.message}`);
  return (data ?? []) as AlertRow[];
}

async function loadRecentTrades(supabase: SupabaseClient, since: string): Promise<import("./alerts").RwaTrade[]> {
  const { data: pools, error: poolsError } = await withFetchRetry(() =>
    supabase.from("rwa_pools").select("pool_id, token0, token1").eq("chain_id", robinhoodChain.id).eq("dex", "uniswap_v4")
  );
  if (poolsError) throw new Error(`Could not read rwa_pools: ${poolsError.message}`);
  if (!pools || pools.length === 0) return [];

  const tickerByPoolId = new Map<string, { ticker: string; usdgIsToken0: boolean; nonUsdgAddress: string }>();
  const nonUsdgAddresses = pools.map((p) => (p.token0.toLowerCase() === USDG.toLowerCase() ? p.token1 : p.token0));
  const { data: tokenRows, error: tokensError } = await withFetchRetry(() =>
    supabase.from("rwa_tokens").select("address, underlying_ticker").eq("chain_id", robinhoodChain.id).in("address", nonUsdgAddresses)
  );
  if (tokensError) throw new Error(`Could not read rwa_tokens: ${tokensError.message}`);
  const tickerByAddress = new Map((tokenRows ?? []).map((t) => [t.address.toLowerCase(), t.underlying_ticker]));

  for (const pool of pools) {
    const usdgIsToken0 = pool.token0.toLowerCase() === USDG.toLowerCase();
    const nonUsdgAddress = usdgIsToken0 ? pool.token1 : pool.token0;
    const ticker = tickerByAddress.get(nonUsdgAddress.toLowerCase());
    if (ticker) tickerByPoolId.set(pool.pool_id, { ticker, usdgIsToken0, nonUsdgAddress });
  }
  if (tickerByPoolId.size === 0) return [];

  const { data: swaps, error: swapsError } = await withFetchRetry(() =>
    supabase
      .from("indexer_swaps")
      .select("pool_id, amount0, amount1, tx_hash")
      .eq("dex", "uniswap_v4")
      .in("pool_id", [...tickerByPoolId.keys()])
      .gte("block_timestamp", since)
  );
  if (swapsError) throw new Error(`Could not read indexer_swaps: ${swapsError.message}`);

  return (swaps ?? []).flatMap((s) => {
    const pool = tickerByPoolId.get(s.pool_id);
    if (!pool) return [];
    const usdgRaw = Number(pool.usdgIsToken0 ? s.amount0 : s.amount1);
    return [{ ticker: pool.ticker, usdAmount: Math.abs(usdgRaw) / 10 ** 6, txHash: s.tx_hash }];
  });
}

async function loadNewListings(supabase: SupabaseClient, since: string): Promise<import("./alerts").NewListing[]> {
  const { data, error } = await withFetchRetry(() =>
    supabase.from("rwa_tokens").select("address, underlying_ticker, issuer_id, discovered_at").eq("verified", true).gte("discovered_at", since)
  );
  if (error) throw new Error(`Could not read rwa_tokens: ${error.message}`);
  return (data ?? []).map((t) => ({ ticker: t.underlying_ticker, address: t.address, issuerId: t.issuer_id, discoveredAt: t.discovered_at }));
}

async function deliverAndRecord(
  supabase: SupabaseClient,
  fired: FiredAlert[],
  alertsById: Map<number, AlertRow>
): Promise<{ web: number; telegram: number }> {
  let web = 0;
  let telegram = 0;

  for (const event of fired) {
    const alert = alertsById.get(event.alertId);
    if (!alert) continue;

    let delivered_telegram = false;
    if (alert.channel === "telegram") {
      const { data: link } = await withFetchRetry(() =>
        supabase.from("telegram_links").select("chat_id").eq("account", alert.account).maybeSingle()
      );
      if (link?.chat_id) {
        delivered_telegram = await sendTelegramMessage(link.chat_id, event.message);
      }
    }

    const { error } = await withFetchRetry(() =>
      supabase.from("alert_notifications").insert({
        alert_id: event.alertId,
        message: event.message,
        dedupe_key: event.dedupeKey,
        delivered_web: true, // "web" delivery is just existing in this table for the UI to read — always true once inserted
        delivered_telegram,
      })
    );
    // A unique-violation here means this exact (alert, dedupeKey) already
    // fired on a previous pass — not an error, just nothing new to count.
    if (error) {
      if (error.code === "23505") continue;
      throw new Error(`alert_notifications insert failed: ${error.message}`);
    }

    web++;
    if (delivered_telegram) telegram++;
  }

  return { web, telegram };
}

export async function runAlertsPass(): Promise<AlertsRunResult> {
  const supabase = getSupabaseServer();
  if (!supabase) return { status: "skipped", reason: "Supabase not configured" };

  const alerts = await loadAlerts(supabase);
  if (alerts.length === 0) return { status: "ok", evaluated: 0, fired: 0, delivered: { web: 0, telegram: 0 } };

  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const [{ summaries }, newListings, recentTrades] = await Promise.all([
    loadTickerTokens(supabase),
    loadNewListings(supabase, since),
    loadRecentTrades(supabase, since),
  ]);
  const premiumByTicker = new Map(summaries.map((s) => [s.ticker, s.primaryPremiumBps]));

  const fired = [
    ...checkPremiumAlerts(alerts, premiumByTicker, today),
    ...checkListingAlerts(alerts, newListings),
    ...checkWhaleAlerts(alerts, recentTrades),
  ];

  const alertsById = new Map(alerts.map((a) => [a.id, a]));
  const delivered = await deliverAndRecord(supabase, fired, alertsById);

  return { status: "ok", evaluated: alerts.length, fired: fired.length, delivered };
}
