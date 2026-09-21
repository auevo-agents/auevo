import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, pad, toEventSelector, toHex } from "viem";

vi.mock("./evm/client", () => ({
  getRobinhoodClient: () => ({
    readContract: async ({ functionName }: { functionName: string }) =>
      functionName === "symbol" ? "MOCK" : 18,
  }),
}));

const TOKEN0 = "0x1111111111111111111111111111111111111111";
const TOKEN1 = "0x2222222222222222222222222222222222222222";
const POOL = "0x3333333333333333333333333333333333333333";
const FEE = 3000;

vi.mock("./evm/blockscout", () => ({
  fetchBlockscoutLogs: async () => [
    {
      // tickSpacing (int24) + pool (address), non-indexed params only —
      // token0/token1/fee are indexed and live in topics, not data.
      data: encodeAbiParameters(
        [{ type: "int24" }, { type: "address" }],
        [60, POOL]
      ),
      topics: [
        toEventSelector(
          "PoolCreated(address,address,uint24,int24,address)"
        ),
        pad(TOKEN0, { size: 32 }),
        pad(TOKEN1, { size: 32 }),
        pad(toHex(FEE), { size: 32 }),
      ],
      blockNumber: "12345",
      timestamp: Math.floor(Date.now() / 1000) - 90,
      transactionHash: `0x${"ab".repeat(32)}`,
    },
  ],
}));

describe("fetchNewPools", () => {
  it("decodes a real PoolCreated log shape end to end", async () => {
    const { fetchNewPools } = await import("./new-pools");
    const pools = await fetchNewPools(10);

    expect(pools).toHaveLength(1);
    expect(pools[0].pool.toLowerCase()).toBe(POOL.toLowerCase());
    expect(pools[0].token0.toLowerCase()).toBe(TOKEN0.toLowerCase());
    expect(pools[0].token1.toLowerCase()).toBe(TOKEN1.toLowerCase());
    expect(pools[0].fee).toBe(FEE);
    expect(pools[0].token0Symbol).toBe("MOCK");
    expect(pools[0].ageSeconds).toBeGreaterThan(0);
  });
});
