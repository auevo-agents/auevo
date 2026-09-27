import { describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RobinhoodClient } from "@/lib/evm/client";
import { backfillMissingPools } from "./registry";
import { USDG, STATE_VIEW } from "./dex/addresses";

const NVDA: Address = "0x1111111111111111111111111111111111111111";
const SPY: Address = "0x2222222222222222222222222222222222222222";

/**
 * A minimal fake matching only the `.from(table).select()/.upsert()`
 * shape backfillMissingPools actually calls — see baskets.test.ts's own
 * fakeSupabase for the same pattern applied to a different module.
 */
function fakeSupabase(params: {
  tokens: { address: string }[];
  pools: { token0: string; token1: string }[];
  onUpsert?: (rows: unknown[]) => void;
}): SupabaseClient {
  return {
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        upsert: (rows: unknown[]) => {
          params.onUpsert?.(rows);
          return { then: (resolve: (v: { error: null }) => void) => resolve({ error: null }) };
        },
        then: (resolve: (v: { data: unknown; error: null }) => void) => {
          if (table === "rwa_tokens") return resolve({ data: params.tokens, error: null });
          if (table === "rwa_pools") return resolve({ data: params.pools, error: null });
          throw new Error(`unmocked table: ${table}`);
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

/** Only NVDA's 3000-fee pool reads back as initialized; every other (token, fee) probe reads back uninitialized. */
function mockClient(initialized: { token: Address; fee: number }[]): RobinhoodClient {
  return {
    readContract: vi.fn(async ({ address, args }: { address: Address; args: unknown[] }) => {
      if (address.toLowerCase() !== STATE_VIEW.toLowerCase()) throw new Error(`unmocked address: ${address}`);
      const [id] = args as [`0x${string}`];
      const matched = idsMatch.get(id);
      const isInitialized = matched && initialized.some((i) => i.token === matched.token && i.fee === matched.fee);
      return isInitialized ? ([1n, 0, 0, 0] as const) : ([0n, 0, 0, 0] as const);
    }),
  } as never;
}

// Populated by buildPoolKey/poolId inside backfillMissingPools itself — the test can't precompute a poolId without
// re-implementing that hashing, so instead it tracks (token, fee) by insertion order via a side channel.
const idsMatch = new Map<`0x${string}`, { token: Address; fee: number }>();

describe("backfillMissingPools", () => {
  it("finds and upserts a live on-chain pool for a verified token missing from rwa_pools", async () => {
    idsMatch.clear();
    const { poolId, buildPoolKey } = await import("./dex/pool-key");
    const { V4_FEE_TIERS, FEE_TO_TICK_SPACING } = await import("./dex/addresses");
    for (const fee of V4_FEE_TIERS) {
      const key = buildPoolKey(USDG, NVDA, fee, FEE_TO_TICK_SPACING[fee]);
      idsMatch.set(poolId(key), { token: NVDA, fee });
    }

    const client = mockClient([{ token: NVDA, fee: 3000 }]);
    const supabase = fakeSupabase({ tokens: [{ address: NVDA }], pools: [] });

    const result = await backfillMissingPools(client, supabase);
    expect(result.checked).toBe(1);
    expect(result.found).toBe(1);
  });

  it("skips a token that already has a covered pool", async () => {
    const client = mockClient([]);
    const supabase = fakeSupabase({
      tokens: [{ address: NVDA }],
      pools: [{ token0: USDG, token1: NVDA }],
    });

    const result = await backfillMissingPools(client, supabase);
    expect(result.checked).toBe(1);
    expect(result.found).toBe(0);
    expect(client.readContract).not.toHaveBeenCalled();
  });

  it("returns zero when there are no verified tokens at all", async () => {
    const client = mockClient([]);
    const supabase = fakeSupabase({ tokens: [], pools: [] });

    const result = await backfillMissingPools(client, supabase);
    expect(result).toEqual({ checked: 0, found: 0 });
  });

  it("leaves a token with no initialized pool at any fee tier out of the upsert", async () => {
    const client = mockClient([]);
    let upserted: unknown[] | null = null;
    const supabase = fakeSupabase({
      tokens: [{ address: SPY }],
      pools: [],
      onUpsert: (rows) => {
        upserted = rows;
      },
    });

    const result = await backfillMissingPools(client, supabase);
    expect(result.found).toBe(0);
    expect(upserted).toBeNull();
  });
});
