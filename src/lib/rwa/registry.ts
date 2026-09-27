import { parseAbiItem, type Address } from "viem";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RobinhoodClient } from "@/lib/evm/client";
import { Deadline } from "@/lib/evm/deadline";
import { readTokenMetadata } from "@/lib/evm/erc20";
import { robinhoodChain } from "@/lib/chains";
import { POOL_MANAGER, USDG, STATE_VIEW, V4_FEE_TIERS, FEE_TO_TICK_SPACING, ZERO_ADDRESS } from "@/lib/rwa/dex/addresses";
import { buildPoolKey, poolId } from "@/lib/rwa/dex/pool-key";
import { withFetchRetry } from "./db-retry";

/**
 * Discovers tokenized-stock tokens on Robinhood Chain by finding every v4
 * pool quoted in USDG — the same quote asset every RWA token here trades
 * against (RWA_SPEC.md section 2) — rather than trusting a hardcoded
 * token-address list. RWA_SPEC.md's own phase-1 checklist names two
 * example addresses (NVDA, TSM) "to verify on Blockscout"; this discovers
 * them (and anything else) from the chain itself at runtime instead,
 * which is a stronger guarantee than trusting copy-pasted addresses from
 * a spec document, and doesn't go stale as more stocks get listed.
 *
 * v4 has no factory to enumerate pools from (see src/lib/rwa/dex/quote.ts's
 * own note on this) — PoolManager's `Initialize` event is the only way to
 * find them, and currency0/currency1 are each indexed, so this can filter
 * `eth_getLogs` server-side by "one leg is USDG" instead of pulling every
 * pool ever initialized (a wildcard scan for this event, un-filtered by
 * currency, was never tried against this RPC — but the indexer's own
 * discovery of an unrelated wildcard-query rejection on this same node
 * is reason enough to filter rather than find out the hard way).
 *
 * Confirmed against Uniswap/v4-core's own source
 * (src/interfaces/IPoolManager.sol) 2026-09-26 — the same discipline as
 * lib/indexer/events.ts: a wrong event signature doesn't error, it just
 * silently returns zero logs forever.
 */
const INITIALIZE_EVENT = parseAbiItem(
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)"
);

const CHUNK_BLOCKS = 10_000n;

export interface DiscoveredUsdgPool {
  poolId: `0x${string}`;
  /** The non-USDG leg — the candidate stock/asset token. */
  token: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
  blockNumber: string;
}

export interface ScanResult {
  pools: DiscoveredUsdgPool[];
  scannedTo: bigint;
  partial: boolean;
}

/**
 * Chunked scan for v4 pools with USDG on one side, checkpointed by the
 * caller (see api/cron/rwa-registry/route.ts) — same CHUNK_BLOCKS/deadline
 * shape as lib/indexer/scan.ts, kept as its own copy rather than shared
 * because this scan's event, filter and dedup logic are all different
 * (currency-filtered Initialize vs an address-filtered Swap batch) and a
 * shared abstraction over both would need to be more generic than either
 * caller actually benefits from.
 */
export async function discoverUsdgPools(
  client: RobinhoodClient,
  fromBlock: bigint,
  toBlock: bigint,
  maxChunks: number,
  deadline: Deadline
): Promise<ScanResult> {
  const pools: DiscoveredUsdgPool[] = [];
  let cursor = fromBlock;
  let chunksUsed = 0;
  let partial = false;
  let scannedTo = fromBlock > 0n ? fromBlock - 1n : 0n;

  while (cursor <= toBlock) {
    if (chunksUsed >= maxChunks || deadline.expired) {
      partial = true;
      break;
    }

    const chunkTo = cursor + CHUNK_BLOCKS - 1n > toBlock ? toBlock : cursor + CHUNK_BLOCKS - 1n;

    try {
      const [asToken1, asToken0] = await Promise.all([
        client.getLogs({
          address: POOL_MANAGER,
          event: INITIALIZE_EVENT,
          args: { currency0: USDG },
          fromBlock: cursor,
          toBlock: chunkTo,
        }),
        client.getLogs({
          address: POOL_MANAGER,
          event: INITIALIZE_EVENT,
          args: { currency1: USDG },
          fromBlock: cursor,
          toBlock: chunkTo,
        }),
      ]);

      const seen = new Set<string>();
      for (const log of [...asToken1, ...asToken0]) {
        const { id, currency0, currency1, fee, tickSpacing, hooks } = log.args;
        if (
          id === undefined ||
          !currency0 ||
          !currency1 ||
          fee === undefined ||
          tickSpacing === undefined ||
          !hooks ||
          log.blockNumber === null
        ) {
          continue;
        }
        if (seen.has(id)) continue; // a pool matching both filters (shouldn't happen — currency0 != currency1) would otherwise double-count
        seen.add(id);

        const token = currency0.toLowerCase() === USDG.toLowerCase() ? currency1 : currency0;
        pools.push({
          poolId: id,
          token,
          fee,
          tickSpacing,
          hooks,
          blockNumber: log.blockNumber.toString(),
        });
      }
      scannedTo = chunkTo;
    } catch {
      partial = true;
      break;
    }

    chunksUsed += 1;
    cursor = chunkTo + 1n;
  }

  return { pools, scannedTo, partial };
}

export interface CandidateToken {
  address: Address;
  symbol: string | null;
  decimals: number | null;
  firstSeenBlock: string;
}

/**
 * Resolves each discovered pool's non-USDG leg to its ERC-20 metadata —
 * reusing lib/evm/erc20.ts's readTokenMetadata rather than a fresh ABI
 * call, since it already handles the non-standard-token and hostile-text
 * cases (fake/lookalike symbols) a scanner has to expect.
 */
export async function resolveCandidateTokens(
  client: RobinhoodClient,
  pools: DiscoveredUsdgPool[]
): Promise<CandidateToken[]> {
  const byToken = new Map<string, DiscoveredUsdgPool>();
  for (const pool of pools) {
    const key = pool.token.toLowerCase();
    // Keep the earliest sighting — first_seen_block should reflect when
    // this token first got a USDG pool, not the most recent one found.
    const existing = byToken.get(key);
    if (!existing || BigInt(pool.blockNumber) < BigInt(existing.blockNumber)) {
      byToken.set(key, pool);
    }
  }

  return Promise.all(
    [...byToken.entries()].map(async ([, pool]) => {
      const meta = await readTokenMetadata(client, pool.token);
      return {
        address: pool.token,
        symbol: meta.symbol?.issues.length ? null : (meta.symbol?.display ?? null), // never trust a symbol flagged as disguised/hostile text
        decimals: meta.decimals,
        firstSeenBlock: pool.blockNumber,
      };
    })
  );
}

export const STATE_VIEW_SLOT0_ABI = [
  {
    type: "function",
    name: "getSlot0",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
  },
] as const;

/**
 * Self-heals a real gap the block-scan discovery above can leave behind:
 * `discoverUsdgPools`'s checkpoint (rwa_registry_state.synced_to_block)
 * always advances past whatever range it just scanned even when the
 * matched pool's own `rwa_pools` upsert fails (run-registry.ts's own doc
 * comment on why — a token-discovery failure must never get stuck
 * re-scanning forever, but the tradeoff is that a *pool* row lost to a
 * transient failure in that same pass is never retried once the
 * checkpoint moves on, since the Initialize event that would have found
 * it again now sits behind `synced_to_block`). Confirmed against
 * production 2026-09-27: 5 verified rwa_tokens on Robinhood Chain, 0
 * rwa_pools rows at all.
 *
 * Rather than re-scanning event history for these specific tokens, this
 * checks current on-chain state directly — the same StateView.getSlot0
 * probe dex/quote.ts's own bestV4Leg already uses to find a live route,
 * across the same standard fee tiers this app already assumes vanilla
 * (no-hooks) RWA/USDG pools use (see dex/addresses.ts's own note on
 * that). A token already covered by an existing rwa_pools row is
 * skipped — this only ever fills in what's missing, never re-probes
 * pools discovery already found.
 */
export async function backfillMissingPools(
  client: RobinhoodClient,
  supabase: SupabaseClient
): Promise<{ checked: number; found: number }> {
  const { data: tokens, error: tokensError } = await withFetchRetry(() =>
    supabase.from("rwa_tokens").select("address").eq("chain_id", robinhoodChain.id).eq("verified", true)
  );
  if (tokensError) throw new Error(`Could not read rwa_tokens: ${tokensError.message}`);
  if (!tokens || tokens.length === 0) return { checked: 0, found: 0 };

  const { data: existingPools, error: poolsError } = await withFetchRetry(() =>
    supabase.from("rwa_pools").select("token0, token1").eq("chain_id", robinhoodChain.id).eq("dex", "uniswap_v4")
  );
  if (poolsError) throw new Error(`Could not read rwa_pools: ${poolsError.message}`);

  const covered = new Set<string>();
  for (const p of existingPools ?? []) {
    const other = p.token0.toLowerCase() === USDG.toLowerCase() ? p.token1 : p.token0;
    covered.add(other.toLowerCase());
  }

  const missing = tokens.filter((t) => !covered.has(t.address.toLowerCase()));
  if (missing.length === 0) return { checked: tokens.length, found: 0 };

  const newRows: {
    chain_id: number;
    pool_id: `0x${string}`;
    dex: "uniswap_v4";
    token0: Address;
    token1: Address;
    fee: number;
    tick_spacing: number;
    hooks: Address;
  }[] = [];

  for (const token of missing) {
    for (const fee of V4_FEE_TIERS) {
      const tickSpacing = FEE_TO_TICK_SPACING[fee];
      const key = buildPoolKey(USDG, token.address as Address, fee, tickSpacing);
      const id = poolId(key);
      try {
        const slot0 = await client.readContract({
          address: STATE_VIEW,
          abi: STATE_VIEW_SLOT0_ABI,
          functionName: "getSlot0",
          args: [id],
        });
        if (slot0[0] === 0n) continue; // uninitialized at this fee tier
        newRows.push({
          chain_id: robinhoodChain.id,
          pool_id: id,
          dex: "uniswap_v4",
          token0: key.currency0,
          token1: key.currency1,
          fee,
          tick_spacing: tickSpacing,
          hooks: ZERO_ADDRESS,
        });
      } catch {
        // Node hiccup on this one probe — the next pass tries again; never block the rest of the backfill on it.
      }
    }
  }

  if (newRows.length > 0) {
    const { error } = await withFetchRetry(() => supabase.from("rwa_pools").upsert(newRows, { onConflict: "chain_id,pool_id" }));
    if (error) throw new Error(`rwa_pools backfill upsert failed: ${error.message}`);
  }

  return { checked: tokens.length, found: newRows.length };
}

/**
 * The other half of 0014_rwa_pool_candidates.sql's fix (see that
 * migration's own doc comment, and run-registry.ts's own comment where
 * every discovered pool's candidate gets cached here regardless of
 * match): re-checks every cached candidate against the *current*
 * rwa_underlyings catalog and promotes any newly-matching one straight
 * to rwa_tokens + rwa_pools — a plain DB join, no RPC calls needed, so
 * this runs on every pass regardless of block-scan progress. A ticker
 * added to the catalog today immediately picks up any pool this app
 * already scanned in the past for it, instead of waiting for a fresh
 * Initialize event that will never come (the pool already exists).
 */
export async function reconcilePoolCandidates(supabase: SupabaseClient): Promise<{ promoted: number }> {
  const { data: underlyings, error: underlyingsError } = await withFetchRetry(() =>
    supabase.from("rwa_underlyings").select("ticker")
  );
  if (underlyingsError) throw new Error(`Could not read rwa_underlyings: ${underlyingsError.message}`);
  const knownTickers = new Set((underlyings ?? []).map((u) => u.ticker as string));
  if (knownTickers.size === 0) return { promoted: 0 };

  const { data: candidates, error: candidatesError } = await withFetchRetry(() =>
    supabase.from("rwa_pool_candidates").select("*").eq("chain_id", robinhoodChain.id).not("symbol", "is", null)
  );
  if (candidatesError) throw new Error(`Could not read rwa_pool_candidates: ${candidatesError.message}`);
  if (!candidates || candidates.length === 0) return { promoted: 0 };

  const { data: existingTokens, error: tokensError } = await withFetchRetry(() =>
    supabase.from("rwa_tokens").select("address").eq("chain_id", robinhoodChain.id)
  );
  if (tokensError) throw new Error(`Could not read rwa_tokens: ${tokensError.message}`);
  const existingAddresses = new Set((existingTokens ?? []).map((t) => (t.address as string).toLowerCase()));

  const toPromote = candidates.filter(
    (c) => c.symbol && c.decimals !== null && knownTickers.has(c.symbol) && !existingAddresses.has((c.token_address as string).toLowerCase())
  );
  if (toPromote.length === 0) return { promoted: 0 };

  const { error: tokensUpsertError } = await withFetchRetry(() =>
    supabase.from("rwa_tokens").upsert(
      toPromote.map((c) => ({
        chain_id: robinhoodChain.id,
        address: c.token_address,
        underlying_ticker: c.symbol,
        issuer_id: "robinhood",
        symbol: c.symbol,
        decimals: c.decimals,
        verified: true,
        first_seen_block: c.first_seen_block,
      })),
      { onConflict: "chain_id,address" }
    )
  );
  if (tokensUpsertError) throw new Error(`rwa_tokens upsert (candidate reconcile) failed: ${tokensUpsertError.message}`);

  const poolRows = toPromote.map((c) => {
    const key = buildPoolKey(USDG, c.token_address as Address, c.fee as number, c.tick_spacing as number, c.hooks as Address);
    return {
      chain_id: robinhoodChain.id,
      pool_id: c.pool_id as `0x${string}`,
      dex: "uniswap_v4" as const,
      token0: key.currency0,
      token1: key.currency1,
      fee: c.fee as number,
      tick_spacing: c.tick_spacing as number,
      hooks: c.hooks as Address,
    };
  });
  const { error: poolsUpsertError } = await withFetchRetry(() =>
    supabase.from("rwa_pools").upsert(poolRows, { onConflict: "chain_id,pool_id" })
  );
  if (poolsUpsertError) throw new Error(`rwa_pools upsert (candidate reconcile) failed: ${poolsUpsertError.message}`);

  return { promoted: toPromote.length };
}
