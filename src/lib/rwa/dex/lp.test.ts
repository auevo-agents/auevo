import { describe, expect, it, vi } from "vitest";
import type { Address, PublicClient } from "viem";
import { buildAddLiquidity } from "./lp";
import { USDG, V4_POSITION_MANAGER } from "./addresses";

const STOCK: Address = "0x1111111111111111111111111111111111111111";
const RECIPIENT: Address = "0x9999999999999999999999999999999999999999";
const SQRT_PRICE_X96_1_1 = 79228162514264337593543950336n; // price = 1.0 in Q96

function mockClient(): PublicClient {
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === "getSlot0") return [SQRT_PRICE_X96_1_1, 0, 0, 0] as const;
      if (functionName === "getLiquidity") return 1_000_000_000_000_000_000n;
      throw new Error(`unmocked call: ${functionName}`);
    }),
  } as unknown as PublicClient;
}

describe("buildAddLiquidity", () => {
  it("targets V4_POSITION_MANAGER with a real mint calldata blob", async () => {
    const built = await buildAddLiquidity({
      client: mockClient(),
      token: STOCK,
      tokenDecimals: 18,
      tokenSymbol: "STOCK",
      fee: 3000,
      tickSpacing: 60,
      hooks: "0x0000000000000000000000000000000000000000",
      amountUsdgIn: 1000_000000n, // 1000 USDG (6 decimals)
      recipient: RECIPIENT,
      slippageBps: 100,
      deadline: Math.floor(Date.now() / 1000) + 1200,
    });

    expect(built.to.toLowerCase()).toBe(V4_POSITION_MANAGER.toLowerCase());
    expect(built.data.startsWith("0x")).toBe(true);
    expect(built.data.length).toBeGreaterThan(10);
    expect(BigInt(built.amountUsdgRequired)).toBeGreaterThan(0n);
    expect(BigInt(built.amountTokenRequired)).toBeGreaterThan(0n);
  });

  it("throws a clear error when the pool has no on-chain liquidity yet", async () => {
    const uninitializedClient = {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
        if (functionName === "getSlot0") return [0n, 0, 0, 0] as const;
        if (functionName === "getLiquidity") return 0n;
        throw new Error(`unmocked call: ${functionName}`);
      }),
    } as unknown as PublicClient;

    await expect(
      buildAddLiquidity({
        client: uninitializedClient,
        token: STOCK,
        tokenDecimals: 18,
        tokenSymbol: "STOCK",
        fee: 3000,
        tickSpacing: 60,
        hooks: "0x0000000000000000000000000000000000000000",
        amountUsdgIn: 1000_000000n,
        recipient: RECIPIENT,
        slippageBps: 100,
        deadline: Math.floor(Date.now() / 1000) + 1200,
      })
    ).rejects.toThrow(/no on-chain liquidity/);
  });

  it("sorts currency0/currency1 the same way when the token address is numerically greater than USDG's", async () => {
    // The first test already covers token < USDG (STOCK's "0x11...1" sorts before USDG's "0x5f..."); this covers the other ordering.
    const largerAddress: Address = "0x8888888888888888888888888888888888888888";
    expect(BigInt(largerAddress) > BigInt(USDG)).toBe(true);
    const built = await buildAddLiquidity({
      client: mockClient(),
      token: largerAddress,
      tokenDecimals: 18,
      tokenSymbol: "STOCK",
      fee: 3000,
      tickSpacing: 60,
      hooks: "0x0000000000000000000000000000000000000000",
      amountUsdgIn: 500_000000n,
      recipient: RECIPIENT,
      slippageBps: 50,
      deadline: Math.floor(Date.now() / 1000) + 1200,
    });
    expect(BigInt(built.amountUsdgRequired)).toBeGreaterThan(0n);
  });
});
