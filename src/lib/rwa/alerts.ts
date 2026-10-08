/**
 * RWA_SPEC.md Phase 8's alerts — "subscribe to premium > X, a new ticker
 * listing, a large trade". Pure evaluation logic lives here (no RPC/DB),
 * same split as run-prices.ts/run-registry.ts: run-alerts.ts gathers the
 * inputs, these functions decide what fires.
 *
 * Every alert type fires at most once per (alert, dedupeKey) pair — see
 * 0009_rwa_alerts.sql's own unique constraint — so an evaluation pass can
 * run as often as it likes (in practice: once daily, the same Vercel
 * Hobby-plan cron-frequency constraint documented in vercel.json/
 * run-prices.ts) without spamming the same still-true condition.
 */

export type AlertType = "premium" | "listing" | "whale" | "price";
export type AlertChannel = "web" | "telegram";

export interface AlertRow {
  id: number;
  account: string;
  type: AlertType;
  params: Record<string, unknown>;
  channel: AlertChannel;
}

export interface FiredAlert {
  alertId: number;
  message: string;
  dedupeKey: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Premium alert params: { ticker, thresholdBps } — fires when premiumBps > thresholdBps (literal "premium > X", not |premium|). */
export function checkPremiumAlerts(
  alerts: AlertRow[],
  latestPremiumBpsByTicker: Map<string, number | null>,
  today: string // YYYY-MM-DD — dedupe key granularity: at most one fire per ticker per day
): FiredAlert[] {
  const fired: FiredAlert[] = [];
  for (const alert of alerts) {
    if (alert.type !== "premium") continue;
    const ticker = alert.params.ticker;
    const thresholdBps = alert.params.thresholdBps;
    if (!isNonEmptyString(ticker) || typeof thresholdBps !== "number") continue;

    const premiumBps = latestPremiumBpsByTicker.get(ticker.toUpperCase());
    if (premiumBps === undefined || premiumBps === null) continue;
    if (premiumBps <= thresholdBps) continue;

    fired.push({
      alertId: alert.id,
      dedupeKey: `${today}`,
      message: `${ticker.toUpperCase()} premium is +${(premiumBps / 100).toFixed(2)}% (your threshold: +${(thresholdBps / 100).toFixed(2)}%)`,
    });
  }
  return fired;
}

export interface NewListing {
  ticker: string;
  address: string;
  issuerId: string;
  discoveredAt: string;
}

/** Listing alert params: { ticker? } — a specific ticker to watch, or omitted to fire on any new verified listing. */
export function checkListingAlerts(alerts: AlertRow[], newListings: NewListing[]): FiredAlert[] {
  const fired: FiredAlert[] = [];
  for (const alert of alerts) {
    if (alert.type !== "listing") continue;
    const watchTicker = alert.params.ticker;
    const relevant = isNonEmptyString(watchTicker)
      ? newListings.filter((l) => l.ticker.toUpperCase() === watchTicker.toUpperCase())
      : newListings;

    for (const listing of relevant) {
      fired.push({
        alertId: alert.id,
        dedupeKey: `${listing.address.toLowerCase()}`,
        message: `${listing.ticker} listed by ${listing.issuerId} (${listing.address})`,
      });
    }
  }
  return fired;
}

export interface RwaTrade {
  ticker: string;
  usdAmount: number;
  txHash: string;
}

/** Whale alert params: { ticker, minUsd }. */
export function checkWhaleAlerts(alerts: AlertRow[], recentTrades: RwaTrade[]): FiredAlert[] {
  const fired: FiredAlert[] = [];
  for (const alert of alerts) {
    if (alert.type !== "whale") continue;
    const ticker = alert.params.ticker;
    const minUsd = alert.params.minUsd;
    if (!isNonEmptyString(ticker) || typeof minUsd !== "number") continue;

    const matches = recentTrades.filter((t) => t.ticker.toUpperCase() === ticker.toUpperCase() && t.usdAmount >= minUsd);
    for (const trade of matches) {
      fired.push({
        alertId: alert.id,
        dedupeKey: trade.txHash,
        message: `${ticker.toUpperCase()}: $${trade.usdAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })} trade (${trade.txHash})`,
      });
    }
  }
  return fired;
}
