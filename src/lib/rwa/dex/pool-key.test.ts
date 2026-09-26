import { describe, expect, it } from "vitest";
import { buildPoolKey, poolId, sortCurrencies } from "./pool-key";
import { ZERO_ADDRESS } from "./addresses";

const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as const;
const STOCK = "0x1111111111111111111111111111111111111111" as const;
const ETH_SENTINEL = ZERO_ADDRESS; // v4's own convention for native currency

describe("sortCurrencies", () => {
  it("sorts by numeric address value, native (0x0) always first", () => {
    expect(sortCurrencies(STOCK, USDG)).toEqual(sortCurrencies(USDG, STOCK));
    expect(sortCurrencies(ETH_SENTINEL, USDG)[0]).toBe(ETH_SENTINEL);
  });
});

describe("poolId", () => {
  // Reference values computed independently via @uniswap/v4-sdk's own
  // `Pool.getPoolId` (a different code path — through its Currency/Token
  // wrapper, not viem's abi encoder) — see the comment on poolId() for why
  // this cross-check, not just re-reading the spec, is the real test.
  it("matches @uniswap/v4-sdk's Pool.getPoolId for a USDG/STOCK pool", () => {
    const key = buildPoolKey(USDG, STOCK, 3000, 60);
    expect(poolId(key)).toBe(
      "0xa18ae35cb2baefdd5239477be18ff29d99ec49ab5c8bbd3b9203bfc32af97bc6"
    );
  });

  it("matches @uniswap/v4-sdk's Pool.getPoolId for a native-ETH/USDG pool", () => {
    const key = buildPoolKey(ETH_SENTINEL, USDG, 500, 10);
    expect(poolId(key)).toBe(
      "0x387bf619da4d3fb62bb276482693dba1b9b3520f573cabdfe033384a24125982"
    );
  });

  it("is independent of argument order", () => {
    const a = poolId(buildPoolKey(USDG, STOCK, 3000, 60));
    const b = poolId(buildPoolKey(STOCK, USDG, 3000, 60));
    expect(a).toBe(b);
  });
});
