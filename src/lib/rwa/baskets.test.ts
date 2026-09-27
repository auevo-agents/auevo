import { describe, expect, it, vi } from "vitest";
import type { Address, PublicClient } from "viem";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveBasketBuy, resolveBasketRebalance, type BasketRecord } from "./baskets";
import { USDG, UNISWAP_V3_FACTORY, STATE_VIEW, V4_QUOTER, ZERO_ADDRESS } from "./dex/addresses";

const NVDA: Address = "0x1111111111111111111111111111111111111111";
const TSLA: Address = "0x2222222222222222222222222222222222222222";
const AAPL: Address = "0x3333333333333333333333333333333333333333";

/**
 * A minimal fake matching only the `.from(table).select().eq()...` shape
 * baskets.ts actually calls — real `@supabase/supabase-js` query builders
 * are thenables, so this is a plain array filtered by each `.eq`/`.in`
 * call, resolved once awaited. `rwa_tokens` rows are addresses this test
 * treats as already-verified; a ticker missing from the table below is
 * exactly this test's stand-in for "not yet verified on this chain".
 */
function fakeSupabase(rwaTokens: { address: string; underlying_ticker: string; symbol: string; decimals: number }[]): SupabaseClient {
  return {
    from: (table: string) => {
      if (table !== "rwa_tokens") throw new Error(`unmocked table: ${table}`);
      let rows = rwaTokens;
      const builder = {
        select: () => builder,
        eq: () => builder, // chain_id/verified — every row here is already "chain 4663, verified"
        in: (col: string, values: string[]) => {
          rows = rows.filter((r) => (col === "underlying_ticker" ? values.includes(r.underlying_ticker) : true));
          return builder;
        },
        then: (resolve: (v: { data: typeof rows; error: null }) => void) => resolve({ data: rows, error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

/**
 * Every candidate pool StateView is asked about reads back as
 * initialized (mockClientAlwaysInitialized, below); this map is the real
 * liquidity gate, keyed by (tokenOut, amountIn) rather than by v4's own
 * poolId hash, so these tests stay independent of pool-key.ts's hashing.
 */
function quotesFor(entries: { tokenOut: Address; amountIn: bigint; amountOut: bigint }[]): Map<string, bigint> {
  const map = new Map<string, bigint>();
  for (const e of entries) {
    map.set(`${e.tokenOut.toLowerCase()}-${e.amountIn}`, e.amountOut);
  }
  return map;
}

function basket(holdings: { ticker: string; targetWeight: number }[]): BasketRecord {
  return {
    id: "test-basket",
    kind: "strategy",
    name: "Test Basket",
    description: null,
    chainId: 4663,
    holdings,
    source: "auevo",
    oneYearReturn: null,
  };
}

describe("resolveBasketBuy", () => {
  it("splits totalAmountIn across legs by target weight and quotes each independently", async () => {
    const supabase = fakeSupabase([
      { address: NVDA, underlying_ticker: "NVDA", symbol: "NVDAx", decimals: 18 },
      { address: TSLA, underlying_ticker: "TSLA", symbol: "TSLAx", decimals: 18 },
    ]);
    const client = mockClientAlwaysInitialized(
      quotesFor([
        { tokenOut: NVDA, amountIn: 600_000000n, amountOut: 6_000000000000000000n },
        { tokenOut: TSLA, amountIn: 400_000000n, amountOut: 4_000000000000000000n },
      ])
    );

    const result = await resolveBasketBuy(
      client,
      supabase,
      basket([
        { ticker: "NVDA", targetWeight: 0.6 },
        { ticker: "TSLA", targetWeight: 0.4 },
      ]),
      1000_000000n,
      100,
      "target"
    );

    expect(result.excluded).toEqual([]);
    expect(result.legs).toHaveLength(2);
    const nvdaLeg = result.legs.find((l) => l.ticker === "NVDA")!;
    expect(nvdaLeg.amountIn).toBe(600_000000n);
    expect(nvdaLeg.amountOutMinimum).toBeLessThan(6_000000000000000000n);
  });

  it("excludes a ticker with no verified token and redistributes its weight to the rest", async () => {
    const supabase = fakeSupabase([
      { address: NVDA, underlying_ticker: "NVDA", symbol: "NVDAx", decimals: 18 },
      { address: AAPL, underlying_ticker: "AAPL", symbol: "AAPLx", decimals: 18 },
      // TSLA deliberately missing — stands in for "not verified on this chain yet"
    ]);
    const client = mockClientAlwaysInitialized(
      quotesFor([
        // Equal 3-way split redistributes to 50/50 once TSLA is excluded.
        { tokenOut: NVDA, amountIn: 500_000000n, amountOut: 5_000000000000000000n },
        { tokenOut: AAPL, amountIn: 500_000000n, amountOut: 5_000000000000000000n },
      ])
    );

    const result = await resolveBasketBuy(
      client,
      supabase,
      basket([
        { ticker: "NVDA", targetWeight: 1 / 3 },
        { ticker: "TSLA", targetWeight: 1 / 3 },
        { ticker: "AAPL", targetWeight: 1 / 3 },
      ]),
      1000_000000n,
      100,
      "equal"
    );

    expect(result.excluded).toEqual([{ ticker: "TSLA", reason: "no verified token for this ticker on this chain" }]);
    expect(result.legs).toHaveLength(2);
    expect(result.legs.every((l) => l.amountIn === 500_000000n)).toBe(true);
  });

  it("excludes a ticker with no live pool at its sized amount and redistributes", async () => {
    const supabase = fakeSupabase([
      { address: NVDA, underlying_ticker: "NVDA", symbol: "NVDAx", decimals: 18 },
      { address: TSLA, underlying_ticker: "TSLA", symbol: "TSLAx", decimals: 18 },
    ]);
    // Only NVDA ever quotes; TSLA has no liquidity at any size this test
    // tries. NVDA needs an entry for both its pass-1 (50%) and its
    // pass-2, post-redistribution (100%) sized amount.
    const client = mockClientAlwaysInitialized(
      quotesFor([
        { tokenOut: NVDA, amountIn: 500_000000n, amountOut: 5_000000000000000000n },
        { tokenOut: NVDA, amountIn: 1000_000000n, amountOut: 10_000000000000000000n },
      ])
    );

    const result = await resolveBasketBuy(
      client,
      supabase,
      basket([
        { ticker: "NVDA", targetWeight: 0.5 },
        { ticker: "TSLA", targetWeight: 0.5 },
      ]),
      1000_000000n,
      100,
      "target"
    );

    expect(result.excluded).toEqual([{ ticker: "TSLA", reason: "no live USDG pool at this size" }]);
    expect(result.legs).toHaveLength(1);
    expect(result.legs[0].ticker).toBe("NVDA");
    expect(result.legs[0].amountIn).toBe(1000_000000n);
  });

  it("supports custom weights that don't match the basket's own target weights", async () => {
    const supabase = fakeSupabase([
      { address: NVDA, underlying_ticker: "NVDA", symbol: "NVDAx", decimals: 18 },
      { address: TSLA, underlying_ticker: "TSLA", symbol: "TSLAx", decimals: 18 },
    ]);
    const client = mockClientAlwaysInitialized(
      quotesFor([
        { tokenOut: NVDA, amountIn: 900_000000n, amountOut: 9_000000000000000000n },
        { tokenOut: TSLA, amountIn: 100_000000n, amountOut: 1_000000000000000000n },
      ])
    );

    const result = await resolveBasketBuy(
      client,
      supabase,
      basket([
        { ticker: "NVDA", targetWeight: 0.5 },
        { ticker: "TSLA", targetWeight: 0.5 },
      ]),
      1000_000000n,
      100,
      "custom",
      { NVDA: 9, TSLA: 1 }
    );

    expect(result.legs.find((l) => l.ticker === "NVDA")?.amountIn).toBe(900_000000n);
    expect(result.legs.find((l) => l.ticker === "TSLA")?.amountIn).toBe(100_000000n);
  });
});

describe("resolveBasketRebalance", () => {
  it("detects drift past the threshold and builds sell/buy legs back to target weight", async () => {
    const supabase = fakeSupabase([
      { address: NVDA, underlying_ticker: "NVDA", symbol: "NVDAx", decimals: 18 },
      { address: TSLA, underlying_ticker: "TSLA", symbol: "TSLAx", decimals: 18 },
    ]);
    // Wallet holds 800 NVDA / 200 TSLA (18 decimals, $1/token) against a
    // 50/50 target — 80/20 actual, 3000bps of drift on each leg.
    const client = mockClientAlwaysInitialized(
      quotesFor([
        { tokenOut: NVDA, amountIn: 800_000000000000000000n, amountOut: 800_000000n }, // valuing the held balance
        { tokenOut: NVDA, amountIn: 300_000000000000000000n, amountOut: 300_000000n }, // the resulting sell leg, re-quoted fresh
        { tokenOut: TSLA, amountIn: 200_000000000000000000n, amountOut: 200_000000n }, // valuing the held balance
        { tokenOut: TSLA, amountIn: 300_000000n, amountOut: 300_000000000000000000n }, // the resulting buy leg, re-quoted fresh
      ])
    );

    const result = await resolveBasketRebalance(
      client,
      supabase,
      basket([
        { ticker: "NVDA", targetWeight: 0.5 },
        { ticker: "TSLA", targetWeight: 0.5 },
      ]),
      [
        { ticker: "NVDA", balance: 800_000000000000000000n },
        { ticker: "TSLA", balance: 200_000000000000000000n },
      ],
      300,
      100
    );

    expect(result.needed).toBe(true);
    expect(result.driftBps.NVDA).toBe(3000);
    expect(result.driftBps.TSLA).toBe(-3000);
    expect(result.legs).toHaveLength(2);
    const sellLeg = result.legs.find((l) => l.ticker === "NVDA")!;
    expect(sellLeg.side).toBe("sell");
    expect(sellLeg.amountIn).toBe(300_000000000000000000n);
    const buyLeg = result.legs.find((l) => l.ticker === "TSLA")!;
    expect(buyLeg.side).toBe("buy");
    expect(buyLeg.amountIn).toBe(300_000000n);
  });

  it("reports no rebalance needed when drift is within the threshold", async () => {
    const supabase = fakeSupabase([
      { address: NVDA, underlying_ticker: "NVDA", symbol: "NVDAx", decimals: 18 },
      { address: TSLA, underlying_ticker: "TSLA", symbol: "TSLAx", decimals: 18 },
    ]);
    const client = mockClientAlwaysInitialized(
      quotesFor([
        { tokenOut: NVDA, amountIn: 510_000000000000000000n, amountOut: 510_000000n },
        { tokenOut: TSLA, amountIn: 490_000000000000000000n, amountOut: 490_000000n },
      ])
    );

    const result = await resolveBasketRebalance(
      client,
      supabase,
      basket([
        { ticker: "NVDA", targetWeight: 0.5 },
        { ticker: "TSLA", targetWeight: 0.5 },
      ]),
      [
        { ticker: "NVDA", balance: 510_000000000000000000n },
        { ticker: "TSLA", balance: 490_000000000000000000n },
      ],
      300,
      100
    );

    expect(result.needed).toBe(false);
    expect(result.legs).toEqual([]);
  });

  it("excludes a currently-held ticker with no verified token from the drift calculation", async () => {
    const supabase = fakeSupabase([{ address: NVDA, underlying_ticker: "NVDA", symbol: "NVDAx", decimals: 18 }]);
    const client = mockClientAlwaysInitialized(
      quotesFor([{ tokenOut: NVDA, amountIn: 500_000000000000000000n, amountOut: 500_000000n }])
    );

    const result = await resolveBasketRebalance(
      client,
      supabase,
      basket([
        { ticker: "NVDA", targetWeight: 0.5 },
        { ticker: "TSLA", targetWeight: 0.5 },
      ]),
      [{ ticker: "NVDA", balance: 500_000000000000000000n }],
      300,
      100
    );

    expect(result.excluded).toContainEqual({ ticker: "TSLA", reason: "no verified token for this ticker on this chain" });
  });
});

/** Wraps mockClient so every StateView pool the quote candidates could probe reads back as initialized, keying liveness purely off whether a quote exists for that (tokenOut, amountIn) pair. */
function mockClientAlwaysInitialized(quotes: Map<string, bigint>): PublicClient {
  return {
    readContract: vi.fn(async ({ address, functionName, args }: { address: Address; functionName: string; args: unknown[] }) => {
      if (address.toLowerCase() === UNISWAP_V3_FACTORY.toLowerCase() && functionName === "getPool") {
        return ZERO_ADDRESS;
      }
      if (address.toLowerCase() === STATE_VIEW.toLowerCase() && functionName === "getSlot0") {
        return [1n, 0, 0, 0]; // always "initialized" — quoteExactInputSingle below is the real liquidity gate
      }
      if (address.toLowerCase() === V4_QUOTER.toLowerCase() && functionName === "quoteExactInputSingle") {
        const [{ poolKey, exactAmount }] = args as [{ poolKey: { currency0: Address; currency1: Address }; exactAmount: bigint }];
        const tokenOut = poolKey.currency0.toLowerCase() === USDG.toLowerCase() ? poolKey.currency1 : poolKey.currency0;
        const key = `${tokenOut.toLowerCase()}-${exactAmount}`;
        const amountOut = quotes.get(key);
        if (amountOut === undefined) throw new Error("no liquidity");
        return [amountOut, 0n] as const;
      }
      throw new Error(`unmocked call: ${functionName} on ${address}`);
    }),
  } as unknown as PublicClient;
}
