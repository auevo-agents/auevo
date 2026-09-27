import type { SupabaseClient } from "@supabase/supabase-js";
import type { Address, PublicClient } from "viem";
import { bestLeg, type LegQuote } from "./dex/quote";
import { USDG } from "./dex/addresses";

/**
 * Strategy baskets — RWA_SPEC.md Phase 7. `baskets.holdings` (the jsonb
 * column from 0003_rwa.sql) is keyed by *ticker*, not on-chain address:
 * which issuer's tokenized version of a given stock is actually verified
 * on Robinhood Chain can change (a new issuer lists it, an existing one
 * gets de-verified), and that resolution has to happen at request time
 * against rwa_tokens — a basket definition that baked in a specific
 * address would silently start excluding/misrouting a leg the moment the
 * registry's own verified set moved on, with nothing in this table to
 * explain why. Resolving by ticker also means a basket's weights stay
 * meaningful even before any token for that ticker has been verified yet.
 */

export interface BasketHolding {
  ticker: string;
  /** This basket's own stated target weight, 0..1, summing to 1 across all holdings. */
  targetWeight: number;
}

export interface BasketRecord {
  id: string;
  kind: "strategy" | "index" | "automated";
  name: string;
  description: string | null;
  chainId: number;
  holdings: BasketHolding[];
  source: "auevo" | "reserve" | "glider";
  oneYearReturn: number | null;
}

export type BasketWeightMode = "target" | "equal" | "custom";

export interface ExcludedLeg {
  ticker: string;
  reason: string;
}

export interface ResolvedBasketLeg {
  ticker: string;
  token: Address;
  decimals: number;
  symbol: string;
  /** This leg's final share of totalAmountIn, after exclusion/redistribution — not the basket's stored targetWeight. */
  weight: number;
  quote: LegQuote;
  amountIn: bigint;
  amountOutMinimum: bigint;
}

export interface ResolvedBasketBuy {
  legs: ResolvedBasketLeg[];
  excluded: ExcludedLeg[];
}

export async function loadBasket(supabase: SupabaseClient, id: string): Promise<BasketRecord | null> {
  const { data, error } = await supabase.from("baskets").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not read baskets: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    kind: data.kind,
    name: data.name,
    description: data.description,
    chainId: data.chain_id,
    holdings: data.holdings as BasketHolding[],
    source: data.source,
    oneYearReturn: data.one_year_return,
  };
}

export async function listBaskets(supabase: SupabaseClient, kind?: BasketRecord["kind"]): Promise<BasketRecord[]> {
  let query = supabase.from("baskets").select("*").order("name", { ascending: true });
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query;
  if (error) throw new Error(`Could not read baskets: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    description: row.description,
    chainId: row.chain_id,
    holdings: row.holdings as BasketHolding[],
    source: row.source,
    oneYearReturn: row.one_year_return,
  }));
}

/** One verified rwa_tokens row per ticker (chain_id, address, symbol, decimals) — never a claim about which issuer, just whichever verified listing exists. */
async function resolveVerifiedTokens(
  supabase: SupabaseClient,
  chainId: number,
  tickers: string[]
): Promise<Map<string, { address: Address; decimals: number; symbol: string }>> {
  const { data, error } = await supabase
    .from("rwa_tokens")
    .select("address, underlying_ticker, symbol, decimals")
    .eq("chain_id", chainId)
    .eq("verified", true)
    .in("underlying_ticker", tickers);
  if (error) throw new Error(`Could not read rwa_tokens: ${error.message}`);

  const byTicker = new Map<string, { address: Address; decimals: number; symbol: string }>();
  for (const row of data ?? []) {
    // First verified listing wins if more than one issuer has tokenized
    // the same underlying — deterministic (query order), not a ranking
    // of issuers.
    if (!byTicker.has(row.underlying_ticker)) {
      byTicker.set(row.underlying_ticker, { address: row.address as Address, decimals: row.decimals, symbol: row.symbol });
    }
  }
  return byTicker;
}

function weightsFor(holdings: BasketHolding[], mode: BasketWeightMode, customWeights?: Record<string, number>): Map<string, number> {
  const weights = new Map<string, number>();
  if (mode === "equal") {
    const each = 1 / holdings.length;
    for (const h of holdings) weights.set(h.ticker, each);
    return weights;
  }
  if (mode === "custom") {
    if (!customWeights) throw new Error("customWeights required for weight mode 'custom'");
    const total = holdings.reduce((sum, h) => sum + (customWeights[h.ticker] ?? 0), 0);
    if (total <= 0) throw new Error("customWeights must sum to a positive number");
    for (const h of holdings) weights.set(h.ticker, (customWeights[h.ticker] ?? 0) / total);
    return weights;
  }
  for (const h of holdings) weights.set(h.ticker, h.targetWeight);
  return weights;
}

const MAX_REDISTRIBUTE_PASSES = 3;

/**
 * Resolves a basket buy into concrete, quoted, fully-funded legs —
 * RWA_SPEC.md's "если для актива нет пула — исключить и перераспределить".
 * A ticker is excluded (never partially filled) when it has no verified
 * token on this chain, or no live USDG pool at its sized amount; its
 * weight is then redistributed proportionally across the remaining
 * tickers and everything is re-quoted, up to MAX_REDISTRIBUTE_PASSES
 * times (liquidity at a slightly larger re-sized amount could in
 * principle also fail — this bounds how long a pathological basket can
 * keep the request spinning rather than looping until it converges).
 */
export async function resolveBasketBuy(
  client: PublicClient,
  supabase: SupabaseClient,
  basket: BasketRecord,
  totalAmountIn: bigint,
  slippageBps: number,
  weightMode: BasketWeightMode,
  customWeights?: Record<string, number>
): Promise<ResolvedBasketBuy> {
  const initialWeights = weightsFor(basket.holdings, weightMode, customWeights);
  const tokensByTicker = await resolveVerifiedTokens(
    supabase,
    basket.chainId,
    basket.holdings.map((h) => h.ticker)
  );

  const excluded: ExcludedLeg[] = [];
  let candidates = basket.holdings
    .map((h) => ({ ticker: h.ticker, weight: initialWeights.get(h.ticker) ?? 0 }))
    .filter((c) => c.weight > 0);

  for (const c of candidates) {
    if (!tokensByTicker.has(c.ticker)) {
      excluded.push({ ticker: c.ticker, reason: "no verified token for this ticker on this chain" });
    }
  }
  candidates = candidates.filter((c) => tokensByTicker.has(c.ticker));

  let legs: ResolvedBasketLeg[] = [];

  for (let pass = 0; pass < MAX_REDISTRIBUTE_PASSES && candidates.length > 0; pass++) {
    const weightSum = candidates.reduce((sum, c) => sum + c.weight, 0);
    if (weightSum <= 0) break;

    const stillFailing: string[] = [];
    const nextLegs: ResolvedBasketLeg[] = [];

    for (const c of candidates) {
      const token = tokensByTicker.get(c.ticker)!;
      const normalizedWeight = c.weight / weightSum;
      const amountIn = (totalAmountIn * BigInt(Math.round(normalizedWeight * 1_000_000))) / 1_000_000n;
      if (amountIn <= 0n) {
        stillFailing.push(c.ticker);
        continue;
      }

      const quote = await bestLeg(client, USDG, token.address, amountIn);
      if (!quote) {
        stillFailing.push(c.ticker);
        continue;
      }

      const amountOutMinimum = quote.amountOut - (quote.amountOut * BigInt(slippageBps)) / 10_000n;
      nextLegs.push({
        ticker: c.ticker,
        token: token.address,
        decimals: token.decimals,
        symbol: token.symbol,
        weight: normalizedWeight,
        quote,
        amountIn,
        amountOutMinimum,
      });
    }

    legs = nextLegs;
    if (stillFailing.length === 0) break;

    for (const ticker of stillFailing) {
      excluded.push({ ticker, reason: "no live USDG pool at this size" });
    }
    candidates = candidates.filter((c) => !stillFailing.includes(c.ticker));
  }

  return { legs, excluded };
}

export interface BasketSellRequest {
  ticker: string;
  /** Raw on-chain units of the held token to sell — the client already knows the wallet's balance and picks 25/50/100% of it itself. */
  amountIn: bigint;
}

/**
 * The sell-side mirror of resolveBasketBuy: N held tokens -> USDG, one
 * quote per holding. No weight redistribution here (sell amounts are
 * already fixed by the caller, not derived from a target split) — a
 * holding with no verified token or no live route is simply excluded from
 * this sale rather than having its amount folded into the others', since
 * "sell less than requested" is a safe fallback for a sell in a way it
 * isn't for a buy.
 */
export async function resolveBasketSell(
  client: PublicClient,
  supabase: SupabaseClient,
  chainId: number,
  requests: BasketSellRequest[],
  slippageBps: number
): Promise<ResolvedBasketBuy> {
  const tokensByTicker = await resolveVerifiedTokens(
    supabase,
    chainId,
    requests.map((r) => r.ticker)
  );

  const excluded: ExcludedLeg[] = [];
  const legs: ResolvedBasketLeg[] = [];
  const totalAmountIn = requests.reduce((sum, r) => sum + r.amountIn, 0n);

  for (const request of requests) {
    const token = tokensByTicker.get(request.ticker);
    if (!token) {
      excluded.push({ ticker: request.ticker, reason: "no verified token for this ticker on this chain" });
      continue;
    }
    if (request.amountIn <= 0n) continue;

    const quote = await bestLeg(client, token.address, USDG, request.amountIn);
    if (!quote) {
      excluded.push({ ticker: request.ticker, reason: "no live USDG pool at this size" });
      continue;
    }

    const amountOutMinimum = quote.amountOut - (quote.amountOut * BigInt(slippageBps)) / 10_000n;
    legs.push({
      ticker: request.ticker,
      token: token.address,
      decimals: token.decimals,
      symbol: token.symbol,
      weight: totalAmountIn > 0n ? Number(request.amountIn) / Number(totalAmountIn) : 0,
      quote,
      amountIn: request.amountIn,
      amountOutMinimum,
    });
  }

  return { legs, excluded };
}

export interface RebalanceHoldingInput {
  ticker: string;
  /** Raw on-chain units this wallet currently holds of this ticker's verified token — 0 if none. */
  balance: bigint;
}

export interface ResolvedRebalanceLeg extends ResolvedBasketLeg {
  side: "buy" | "sell";
}

export interface ResolvedBasketRebalance {
  needed: boolean;
  /** This basket's own targetWeight vs. this wallet's current value share, per ticker, in basis points — positive means overweight. */
  driftBps: Record<string, number>;
  legs: ResolvedRebalanceLeg[];
  excluded: ExcludedLeg[];
}

const DUST_THRESHOLD_BPS = 200n; // a leg worth less than 2% of the whole portfolio isn't worth a trade even once the overall drift crosses the alert threshold

/**
 * Non-custodial automated rebalancing — HyperDex's "Automated Baskets"
 * without the part RWA_SPEC.md section 9 rules out (Auevo running its own
 * automated-vault contract that holds user funds). This detects drift from
 * a basket's own stated target weights and prepares the exact trade to
 * correct it, but the funds never leave the holder's wallet until they
 * sign the one resulting transaction — the same non-custodial posture as
 * buy/sell, just computing the trade from a live position instead of a
 * fresh deposit.
 *
 * Every currently-held ticker is valued by actually quoting a sale of its
 * full held balance for USDG (bestLeg), never a stored price row — the
 * real number this wallet would realize selling right now, from the same
 * quoting path buy/sell already trust. A ticker that can't be valued this
 * way (no verified token, or no live route at this size) is excluded
 * entirely and its target weight is redistributed across the tickers that
 * could be valued, mirroring resolveBasketBuy's own "exclude, don't guess"
 * rule rather than assuming a price for it.
 */
export async function resolveBasketRebalance(
  client: PublicClient,
  supabase: SupabaseClient,
  basket: BasketRecord,
  holdings: RebalanceHoldingInput[],
  driftThresholdBps: number,
  slippageBps: number
): Promise<ResolvedBasketRebalance> {
  const tokensByTicker = await resolveVerifiedTokens(
    supabase,
    basket.chainId,
    basket.holdings.map((h) => h.ticker)
  );
  const balanceByTicker = new Map(holdings.filter((h) => h.balance > 0n).map((h) => [h.ticker, h.balance]));

  const excluded: ExcludedLeg[] = [];
  const valued: {
    ticker: string;
    token: Address;
    decimals: number;
    symbol: string;
    balance: bigint;
    valueUsdg: bigint;
    targetWeight: number;
  }[] = [];

  for (const holding of basket.holdings) {
    const token = tokensByTicker.get(holding.ticker);
    if (!token) {
      excluded.push({ ticker: holding.ticker, reason: "no verified token for this ticker on this chain" });
      continue;
    }

    const balance = balanceByTicker.get(holding.ticker) ?? 0n;
    if (balance === 0n) {
      // Not currently held — still a valid rebalance target (a fresh buy leg if underweight), valued at zero for now.
      valued.push({ ticker: holding.ticker, token: token.address, decimals: token.decimals, symbol: token.symbol, balance: 0n, valueUsdg: 0n, targetWeight: holding.targetWeight });
      continue;
    }

    const quote = await bestLeg(client, token.address, USDG, balance);
    if (!quote) {
      excluded.push({ ticker: holding.ticker, reason: "no live USDG pool at this size" });
      continue;
    }
    valued.push({ ticker: holding.ticker, token: token.address, decimals: token.decimals, symbol: token.symbol, balance, valueUsdg: quote.amountOut, targetWeight: holding.targetWeight });
  }

  const totalValueUsdg = valued.reduce((sum, v) => sum + v.valueUsdg, 0n);
  const targetWeightSum = valued.reduce((sum, v) => sum + v.targetWeight, 0);
  if (totalValueUsdg === 0n || targetWeightSum <= 0) {
    return { needed: false, driftBps: {}, legs: [], excluded };
  }

  const driftBps: Record<string, number> = {};
  let maxDriftBps = 0;
  for (const v of valued) {
    const normalizedTarget = v.targetWeight / targetWeightSum;
    const currentWeight = Number(v.valueUsdg) / Number(totalValueUsdg);
    const drift = Math.round((currentWeight - normalizedTarget) * 10_000);
    driftBps[v.ticker] = drift;
    maxDriftBps = Math.max(maxDriftBps, Math.abs(drift));
  }

  if (maxDriftBps < driftThresholdBps) {
    return { needed: false, driftBps, legs: [], excluded };
  }

  const legs: ResolvedRebalanceLeg[] = [];
  for (const v of valued) {
    const normalizedTarget = v.targetWeight / targetWeightSum;
    const targetValueUsdg = (totalValueUsdg * BigInt(Math.round(normalizedTarget * 1_000_000))) / 1_000_000n;
    const deltaUsdg = targetValueUsdg - v.valueUsdg;
    const absDeltaUsdg = deltaUsdg < 0n ? -deltaUsdg : deltaUsdg;
    if (absDeltaUsdg * 10_000n < totalValueUsdg * DUST_THRESHOLD_BPS) continue; // not worth a dust trade

    if (deltaUsdg < 0n) {
      // Overweight — sell the proportional slice of the held balance worth |deltaUsdg|.
      const sellUsdg = -deltaUsdg;
      const amountIn = v.valueUsdg > 0n ? (v.balance * sellUsdg) / v.valueUsdg : 0n;
      if (amountIn <= 0n) continue;
      const quote = await bestLeg(client, v.token, USDG, amountIn);
      if (!quote) {
        excluded.push({ ticker: v.ticker, reason: "no live USDG pool at this size" });
        continue;
      }
      const amountOutMinimum = quote.amountOut - (quote.amountOut * BigInt(slippageBps)) / 10_000n;
      legs.push({ ticker: v.ticker, token: v.token, decimals: v.decimals, symbol: v.symbol, weight: normalizedTarget, quote, amountIn, amountOutMinimum, side: "sell" });
    } else {
      // Underweight — buy deltaUsdg worth (USDG is Auevo's own 1:1 USD quote asset, so a USD delta is directly a USDG amount).
      const amountIn = deltaUsdg;
      const quote = await bestLeg(client, USDG, v.token, amountIn);
      if (!quote) {
        excluded.push({ ticker: v.ticker, reason: "no live USDG pool at this size" });
        continue;
      }
      const amountOutMinimum = quote.amountOut - (quote.amountOut * BigInt(slippageBps)) / 10_000n;
      legs.push({ ticker: v.ticker, token: v.token, decimals: v.decimals, symbol: v.symbol, weight: normalizedTarget, quote, amountIn, amountOutMinimum, side: "buy" });
    }
  }

  return { needed: legs.length > 0, driftBps, legs, excluded };
}
