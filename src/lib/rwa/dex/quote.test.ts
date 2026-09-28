import { describe, expect, it, vi } from "vitest";
import type { Address, PublicClient } from "viem";
import { bestLeg, quoteRoute } from "./quote";
import { UNISWAP_QUOTER_V2, UNISWAP_V3_FACTORY, V4_QUOTER, STATE_VIEW, USDG, WETH9, ZERO_ADDRESS } from "./addresses";
import { buildPoolKey, poolId } from "./pool-key";

const STOCK: Address = "0x1111111111111111111111111111111111111111";
const OTHER_STOCK: Address = "0x2222222222222222222222222222222222222222";

/**
 * A scripted PublicClient — no network, no mainnet-fork, just enough of
 * readContract's shape for quote.ts's own call patterns. Each test wires
 * up only the pools it cares about; everything else reads back as "no
 * pool" (zero address for v3, sqrtPriceX96 = 0 for v4), matching how an
 * uninitialized pair actually responds on real Robinhood Chain.
 */
function mockClient(overrides: {
  v3Pools?: Map<string, Address>; // key: `${tokenIn}-${tokenOut}-${fee}` (either order)
  v3Quotes?: Map<string, bigint>; // key: `${tokenIn}-${tokenOut}-${fee}-${amountIn}`
  v4Pools?: Set<string>; // key: poolId
  v4Quotes?: Map<string, bigint>; // key: `${poolId}-${zeroForOne}-${amountIn}`
}): PublicClient {
  const v3Pools = overrides.v3Pools ?? new Map();
  const v3Quotes = overrides.v3Quotes ?? new Map();
  const v4Pools = overrides.v4Pools ?? new Set();
  const v4Quotes = overrides.v4Quotes ?? new Map();

  return {
    readContract: vi.fn(async ({ address, functionName, args }: { address: Address; functionName: string; args: unknown[] }) => {
      if (address.toLowerCase() === UNISWAP_V3_FACTORY.toLowerCase() && functionName === "getPool") {
        const [a, b, fee] = args as [Address, Address, number];
        const key1 = `${a.toLowerCase()}-${b.toLowerCase()}-${fee}`;
        const key2 = `${b.toLowerCase()}-${a.toLowerCase()}-${fee}`;
        return v3Pools.get(key1) ?? v3Pools.get(key2) ?? ZERO_ADDRESS;
      }
      if (address.toLowerCase() === UNISWAP_QUOTER_V2.toLowerCase() && functionName === "quoteExactInputSingle") {
        const [{ tokenIn, tokenOut, fee, amountIn }] = args as [{ tokenIn: Address; tokenOut: Address; fee: number; amountIn: bigint }];
        const key = `${tokenIn.toLowerCase()}-${tokenOut.toLowerCase()}-${fee}-${amountIn}`;
        const amountOut = v3Quotes.get(key);
        if (amountOut === undefined) throw new Error("no liquidity");
        return [amountOut, 0n, 0, 0n] as const;
      }
      if (address.toLowerCase() === STATE_VIEW.toLowerCase() && functionName === "getSlot0") {
        const [id] = args as [string];
        return v4Pools.has(id) ? [1n, 0, 0, 0] : [0n, 0, 0, 0];
      }
      if (address.toLowerCase() === V4_QUOTER.toLowerCase() && functionName === "quoteExactInputSingle") {
        const [{ poolKey, zeroForOne, exactAmount }] = args as [
          { poolKey: Parameters<typeof poolId>[0]; zeroForOne: boolean; exactAmount: bigint },
        ];
        const id = poolId(poolKey);
        const key = `${id}-${zeroForOne}-${exactAmount}`;
        const amountOut = v4Quotes.get(key);
        if (amountOut === undefined) throw new Error("no liquidity");
        return [amountOut, 0n] as const;
      }
      throw new Error(`unmocked call: ${functionName} on ${address}`);
    }),
  } as unknown as PublicClient;
}

describe("bestLeg", () => {
  it("returns the v3 quote when only a v3 pool exists", async () => {
    const client = mockClient({
      v3Pools: new Map([[`${USDG.toLowerCase()}-${STOCK.toLowerCase()}-3000`, "0xabc0000000000000000000000000000000000abc" as Address]]),
      v3Quotes: new Map([[`${USDG.toLowerCase()}-${STOCK.toLowerCase()}-3000-1000000`, 500000000000000000000n]]),
    });

    const leg = await bestLeg(client, USDG, STOCK, 1_000_000n);
    expect(leg?.protocol).toBe("v3");
    expect(leg?.amountOut).toBe(500000000000000000000n);
  });

  it("prefers v4 over v3 when v4 quotes a better output for the same pair", async () => {
    const key = buildPoolKey(USDG, STOCK, 3000, 60);
    const id = poolId(key);
    const zeroForOne = USDG.toLowerCase() === key.currency0.toLowerCase();

    const client = mockClient({
      v3Pools: new Map([[`${USDG.toLowerCase()}-${STOCK.toLowerCase()}-3000`, "0xabc0000000000000000000000000000000000abc" as Address]]),
      v3Quotes: new Map([[`${USDG.toLowerCase()}-${STOCK.toLowerCase()}-3000-1000000`, 400000000000000000000n]]),
      v4Pools: new Set([id]),
      v4Quotes: new Map([[`${id}-${zeroForOne}-1000000`, 450000000000000000000n]]),
    });

    const leg = await bestLeg(client, USDG, STOCK, 1_000_000n);
    expect(leg?.protocol).toBe("v4");
    expect(leg?.amountOut).toBe(450000000000000000000n);
  });

  it("returns null when neither version has a pool for the pair", async () => {
    const client = mockClient({});
    const leg = await bestLeg(client, STOCK, OTHER_STOCK, 1_000_000n);
    expect(leg).toBeNull();
  });

  it("finds a v4 pool at a non-standard fee tier when it's passed in as a known pool", async () => {
    // Real bug this guards against: Robinhood Chain has shown live v4
    // pools at fees like 375 and 951100 — values outside the four
    // hardcoded V4_FEE_TIERS guesses, so a pair with real liquidity read
    // back as "no pool" until the caller's own discovered rwa_pools rows
    // are passed in as knownPools.
    const key = buildPoolKey(USDG, STOCK, 375, 1);
    const id = poolId(key);
    const zeroForOne = USDG.toLowerCase() === key.currency0.toLowerCase();

    const client = mockClient({
      v4Pools: new Set([id]),
      v4Quotes: new Map([[`${id}-${zeroForOne}-1000000`, 999000000000000000000n]]),
    });

    const withoutKnownPools = await bestLeg(client, USDG, STOCK, 1_000_000n);
    expect(withoutKnownPools).toBeNull();

    const withKnownPools = await bestLeg(client, USDG, STOCK, 1_000_000n, [
      { token0: key.currency0, token1: key.currency1, fee: 375, tickSpacing: 1, hooks: ZERO_ADDRESS },
    ]);
    expect(withKnownPools?.protocol).toBe("v4");
    expect(withKnownPools?.amountOut).toBe(999000000000000000000n);
  });

  it("finds a v4 pool quoted in true native currency (address 0) for a WETH9 leg", async () => {
    const key = buildPoolKey(ZERO_ADDRESS, USDG, 500, 10);
    const id = poolId(key);
    const zeroForOne = ZERO_ADDRESS === key.currency0;

    const client = mockClient({
      v4Pools: new Set([id]),
      v4Quotes: new Map([[`${id}-${zeroForOne}-1000000000000000000`, 3000000000n]]),
    });

    // Caller uses WETH9 (this app's "native ETH" placeholder) — bestLeg
    // should still find the pool that actually uses address(0).
    const leg = await bestLeg(client, WETH9, USDG, 1_000_000_000_000_000_000n);
    expect(leg?.protocol).toBe("v4");
    expect(leg?.amountOut).toBe(3000000000n);
  });
});

describe("quoteRoute", () => {
  it("uses a direct pool when one exists", async () => {
    const client = mockClient({
      v3Pools: new Map([[`${USDG.toLowerCase()}-${STOCK.toLowerCase()}-3000`, "0xabc0000000000000000000000000000000000abc" as Address]]),
      v3Quotes: new Map([[`${USDG.toLowerCase()}-${STOCK.toLowerCase()}-3000-1000000`, 500000000000000000000n]]),
    });

    const route = await quoteRoute(client, USDG, STOCK, 1_000_000n);
    expect(route?.legs).toHaveLength(1);
    expect(route?.amountOut).toBe(500000000000000000000n);
  });

  it("chains two legs through USDG when no direct pool exists (e.g. ETH -> STOCK)", async () => {
    const ethKey = buildPoolKey(WETH9, USDG, 500, 10);
    const ethId = poolId(ethKey);
    const ethZeroForOne = WETH9.toLowerCase() === ethKey.currency0.toLowerCase();

    const client = mockClient({
      v4Pools: new Set([ethId]),
      v4Quotes: new Map([[`${ethId}-${ethZeroForOne}-1000000000000000000`, 3000000000n]]), // 1 ETH -> 3000 USDG (6dp)
      v3Pools: new Map([[`${USDG.toLowerCase()}-${STOCK.toLowerCase()}-3000`, "0xabc0000000000000000000000000000000000abc" as Address]]),
      v3Quotes: new Map([[`${USDG.toLowerCase()}-${STOCK.toLowerCase()}-3000-3000000000`, 30000000000000000000n]]), // 3000 USDG -> 30 STOCK
    });

    const route = await quoteRoute(client, WETH9, STOCK, 1_000_000_000_000_000_000n);
    expect(route?.legs).toHaveLength(2);
    expect(route?.legs[0].protocol).toBe("v4");
    expect(route?.legs[1].protocol).toBe("v3");
    expect(route?.amountOut).toBe(30000000000000000000n);
  });

  it("returns null when one side is USDG and no direct pool exists (no 2-hop through itself)", async () => {
    const client = mockClient({});
    const route = await quoteRoute(client, USDG, STOCK, 1_000_000n);
    expect(route).toBeNull();
  });

  it("returns null when the first leg of a 2-hop route has no pool", async () => {
    const client = mockClient({});
    const route = await quoteRoute(client, WETH9, STOCK, 1_000_000_000_000_000_000n);
    expect(route).toBeNull();
  });
});
