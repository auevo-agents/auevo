import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { Deadline } from "@/lib/evm/deadline";
import { discoverUsdgPools, resolveCandidateTokens } from "./registry";
import { USDG } from "@/lib/rwa/dex/addresses";

const STOCK: Address = "0x1111111111111111111111111111111111111111";
const OTHER_STOCK: Address = "0x2222222222222222222222222222222222222222";
const HOOKS_ZERO: Address = "0x0000000000000000000000000000000000000000";

function mockLog(overrides: {
  id: string;
  currency0: Address;
  currency1: Address;
  fee?: number;
  tickSpacing?: number;
  hooks?: Address;
  blockNumber?: bigint;
}) {
  return {
    args: {
      id: overrides.id,
      currency0: overrides.currency0,
      currency1: overrides.currency1,
      fee: overrides.fee ?? 3000,
      tickSpacing: overrides.tickSpacing ?? 60,
      hooks: overrides.hooks ?? HOOKS_ZERO,
    },
    blockNumber: overrides.blockNumber ?? 100n,
  };
}

describe("discoverUsdgPools", () => {
  it("finds a pool where USDG is currency0 and returns the other leg as the candidate token", async () => {
    const client = {
      getLogs: async ({ args }: { args?: { currency0?: Address; currency1?: Address } }) => {
        if (args?.currency0?.toLowerCase() === USDG.toLowerCase()) {
          return [mockLog({ id: "0xaaa", currency0: USDG, currency1: STOCK })];
        }
        return [];
      },
    } as never;

    const result = await discoverUsdgPools(client, 0n, 200n, 10, Deadline.in(5000));
    expect(result.pools).toHaveLength(1);
    expect(result.pools[0].token).toBe(STOCK);
    expect(result.partial).toBe(false);
  });

  it("finds a pool where USDG is currency1 and merges with currency0 results without double-counting", async () => {
    const client = {
      getLogs: async ({ args }: { args?: { currency0?: Address; currency1?: Address } }) => {
        if (args?.currency0?.toLowerCase() === USDG.toLowerCase()) {
          return [mockLog({ id: "0xaaa", currency0: USDG, currency1: STOCK })];
        }
        if (args?.currency1?.toLowerCase() === USDG.toLowerCase()) {
          return [mockLog({ id: "0xbbb", currency0: OTHER_STOCK, currency1: USDG })];
        }
        return [];
      },
    } as never;

    const result = await discoverUsdgPools(client, 0n, 200n, 10, Deadline.in(5000));
    expect(result.pools).toHaveLength(2);
    const tokens = result.pools.map((p) => p.token).sort();
    expect(tokens).toEqual([OTHER_STOCK, STOCK].sort());
  });

  it("marks the result partial when the chunk budget runs out before reaching toBlock", async () => {
    const client = { getLogs: async () => [] } as never;
    // fromBlock..toBlock spans 3 chunks of CHUNK_BLOCKS (10_000) but maxChunks caps it at 1.
    const result = await discoverUsdgPools(client, 0n, 25_000n, 1, Deadline.in(5000));
    expect(result.partial).toBe(true);
    expect(result.scannedTo).toBe(9_999n);
  });

  it("marks the result partial when a chunk's getLogs call throws", async () => {
    const client = {
      getLogs: async () => {
        throw new Error("RPC rejected the query");
      },
    } as never;
    const result = await discoverUsdgPools(client, 0n, 100n, 10, Deadline.in(5000));
    expect(result.partial).toBe(true);
    expect(result.pools).toHaveLength(0);
  });
});

describe("resolveCandidateTokens", () => {
  it("resolves symbol/decimals via readTokenMetadata and keeps the earliest sighting per token", async () => {
    const client = {
      call: async ({ to }: { to: Address }) => {
        // readTokenMetadata calls name()/symbol()/decimals()/totalSupply() —
        // return a plausible symbol for symbol(), empty otherwise.
        if (to === STOCK) {
          // ABI-encoded string "NVDA"
          return {
            data: "0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000458564441" as `0x${string}`,
          };
        }
        return { data: "0x" as const };
      },
    } as never;

    const pools = [
      { poolId: "0xaaa" as const, token: STOCK, fee: 3000, tickSpacing: 60, hooks: HOOKS_ZERO, blockNumber: "200" },
      { poolId: "0xbbb" as const, token: STOCK, fee: 500, tickSpacing: 10, hooks: HOOKS_ZERO, blockNumber: "100" },
    ];

    const resolved = await resolveCandidateTokens(client, pools);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].address).toBe(STOCK);
    expect(resolved[0].firstSeenBlock).toBe("100"); // the earlier of the two sightings
  });
});
