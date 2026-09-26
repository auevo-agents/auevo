import { getRobinhoodClient } from "@/lib/evm/client";
import { Deadline } from "@/lib/evm/deadline";
import { getSupabaseServer } from "@/lib/supabase";
import { robinhoodChain } from "@/lib/chains";
import { discoverUsdgPools, resolveCandidateTokens } from "./registry";
import { fetchXstocksTokenList, tickerFromXstocksSymbol } from "./xstocks";

/**
 * One incremental registry pass — RWA_SPEC.md Phase 1's
 * `/api/cron/rwa-registry`. Two independent sources, both gated to
 * tickers already in `rwa_underlyings` (see 0004_rwa_seed_underlyings.sql
 * for the current starter set): a token this app doesn't have an
 * underlying row for is never inserted, guessed at, or shown — the
 * foreign key on rwa_tokens.underlying_ticker enforces this at the
 * database level too, not just here.
 *
 * Same block-scan-with-lookback-jump shape as lib/indexer/run.ts, kept
 * separate rather than shared: this scan's event (v4 Initialize, not v3
 * PoolCreated/Swap), checkpoint table, and match/upsert logic are all
 * different enough that sharing would need a more generic abstraction
 * than either caller benefits from — the same call lib/indexer/scan.ts's
 * own doc comment makes about not sharing with lib/rwa/registry.ts.
 */

const MAX_CHUNKS_PER_SCAN = Number(process.env.RWA_REGISTRY_MAX_CHUNKS_PER_RUN) || 30;
const SCAN_BUDGET_MS = 20_000;
const START_BLOCK = BigInt(process.env.RWA_REGISTRY_START_BLOCK || "0");
const LOOKBACK_BLOCKS = BigInt(process.env.RWA_REGISTRY_LOOKBACK_BLOCKS || "2000000");

function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function nextFrom(synced: bigint, headBlock: bigint): bigint {
  const lookbackFloor = headBlock > LOOKBACK_BLOCKS ? headBlock - LOOKBACK_BLOCKS : 0n;
  const floor = maxBigInt(START_BLOCK, lookbackFloor);
  return maxBigInt(synced + 1n, floor);
}

export interface RegistryRunResult {
  status: "ok" | "skipped";
  reason?: string;
  headBlock?: string;
  robinhood?: { discovered: number; syncedTo: string; partial: boolean };
  xstocks?: { discovered: number; available: boolean };
}

export async function runRegistryPass(): Promise<RegistryRunResult> {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return { status: "skipped", reason: "Supabase not configured" };
  }

  const { data: underlyingRows, error: underlyingsError } = await supabase
    .from("rwa_underlyings")
    .select("ticker");
  if (underlyingsError) {
    throw new Error(`Could not read rwa_underlyings: ${underlyingsError.message}`);
  }
  const knownTickers = new Set((underlyingRows ?? []).map((r) => r.ticker as string));

  const client = getRobinhoodClient();
  const headBlock = await client.getBlockNumber();

  const { data: state, error: stateError } = await supabase
    .from("rwa_registry_state")
    .select("synced_to_block")
    .eq("id", 1)
    .single();
  if (stateError || !state) {
    throw new Error(
      `Could not read rwa_registry_state — has 0005_rwa_registry_state.sql been applied? (${stateError?.message ?? "no row"})`
    );
  }

  const synced = BigInt(state.synced_to_block);
  const from = nextFrom(synced, headBlock);

  const scanResult =
    from <= headBlock
      ? await discoverUsdgPools(client, from, headBlock, MAX_CHUNKS_PER_SCAN, Deadline.in(SCAN_BUDGET_MS))
      : { pools: [], scannedTo: synced, partial: false };

  let robinhoodDiscovered = 0;
  if (scanResult.pools.length > 0) {
    const candidates = await resolveCandidateTokens(client, scanResult.pools);
    // Never guess a decimals value (`decimals` is not-null in the schema
    // for good reason — a wrong one silently corrupts every price/amount
    // shown for this token) and only ever record a ticker we already
    // recognize.
    const matched = candidates.filter(
      (c): c is typeof c & { symbol: string; decimals: number } =>
        c.symbol !== null && c.decimals !== null && knownTickers.has(c.symbol)
    );

    if (matched.length > 0) {
      const { error } = await supabase.from("rwa_tokens").upsert(
        matched.map((c) => ({
          chain_id: robinhoodChain.id,
          address: c.address,
          underlying_ticker: c.symbol,
          issuer_id: "robinhood",
          symbol: c.symbol,
          decimals: c.decimals,
          verified: true,
          first_seen_block: c.firstSeenBlock,
        })),
        { onConflict: "chain_id,address" }
      );
      if (error) throw new Error(`rwa_tokens upsert (robinhood) failed: ${error.message}`);
      robinhoodDiscovered = matched.length;
    }
  }

  await supabase
    .from("rwa_registry_state")
    .update({ synced_to_block: scanResult.scannedTo.toString(), updated_at: new Date().toISOString() })
    .eq("id", 1);

  // xStocks: a fresh full fetch every run, not a checkpointed scan — it's
  // one HTTP request against a token list that changes rarely, not a
  // chain to crawl incrementally.
  const xstocksTokens = await fetchXstocksTokenList();
  let xstocksDiscovered = 0;

  if (xstocksTokens) {
    const matched = xstocksTokens
      .map((t) => ({ ...t, ticker: tickerFromXstocksSymbol(t.symbol) }))
      .filter((t): t is typeof t & { ticker: string } => t.ticker !== null && knownTickers.has(t.ticker));

    if (matched.length > 0) {
      const { error } = await supabase.from("rwa_tokens").upsert(
        matched.map((t) => ({
          chain_id: t.chainId,
          address: t.address,
          underlying_ticker: t.ticker,
          issuer_id: "xstocks",
          symbol: t.symbol,
          decimals: t.decimals,
          verified: true,
        })),
        { onConflict: "chain_id,address" }
      );
      if (error) throw new Error(`rwa_tokens upsert (xstocks) failed: ${error.message}`);
      xstocksDiscovered = matched.length;
    }
  }

  return {
    status: "ok",
    headBlock: headBlock.toString(),
    robinhood: {
      discovered: robinhoodDiscovered,
      syncedTo: scanResult.scannedTo.toString(),
      partial: scanResult.partial,
    },
    xstocks: { discovered: xstocksDiscovered, available: xstocksTokens !== null },
  };
}
