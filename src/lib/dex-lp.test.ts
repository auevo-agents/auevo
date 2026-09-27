import { describe, expect, it, vi } from "vitest";
import type { Address, PublicClient } from "viem";
import { buildAddLiquidityV3 } from "./dex-lp";
import { UNISWAP_NFT_POSITION_MANAGER } from "./uniswap";

const TOKEN_A: Address = "0x1111111111111111111111111111111111111111";
const TOKEN_B: Address = "0x8888888888888888888888888888888888888888";
const POOL: Address = "0x2222222222222222222222222222222222222222";
const RECIPIENT: Address = "0x9999999999999999999999999999999999999999";
const SQRT_PRICE_X96_1_1 = 79228162514264337593543950336n; // price = 1.0 in Q96

function mockClient(poolAddress: Address = POOL): PublicClient {
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === "getPool") return poolAddress;
      if (functionName === "slot0") return [SQRT_PRICE_X96_1_1, 0, 0, 0, 0, 0, true] as const;
      if (functionName === "liquidity") return 1_000_000_000_000_000_000n;
      throw new Error(`unmocked call: ${functionName}`);
    }),
  } as unknown as PublicClient;
}

describe("buildAddLiquidityV3", () => {
  it("targets UNISWAP_NFT_POSITION_MANAGER with a real mint calldata blob", async () => {
    const built = await buildAddLiquidityV3({
      client: mockClient(),
      tokenA: TOKEN_A,
      tokenADecimals: 18,
      tokenASymbol: "TOKA",
      tokenB: TOKEN_B,
      tokenBDecimals: 18,
      tokenBSymbol: "TOKB",
      fee: 3000,
      amountAIn: 1000_000000000000000000n,
      recipient: RECIPIENT,
      slippageBps: 100,
      deadline: Math.floor(Date.now() / 1000) + 1200,
    });

    expect(built.to.toLowerCase()).toBe(UNISWAP_NFT_POSITION_MANAGER.toLowerCase());
    expect(built.poolAddress.toLowerCase()).toBe(POOL.toLowerCase());
    expect(built.data.startsWith("0x")).toBe(true);
    expect(built.data.length).toBeGreaterThan(10);
    expect(BigInt(built.amountARequired)).toBeGreaterThan(0n);
    expect(BigInt(built.amountBRequired)).toBeGreaterThan(0n);
  });

  it("throws a clear error when no pool exists for the pair/fee", async () => {
    await expect(
      buildAddLiquidityV3({
        client: mockClient("0x0000000000000000000000000000000000000000"),
        tokenA: TOKEN_A,
        tokenADecimals: 18,
        tokenASymbol: "TOKA",
        tokenB: TOKEN_B,
        tokenBDecimals: 18,
        tokenBSymbol: "TOKB",
        fee: 3000,
        amountAIn: 1000_000000000000000000n,
        recipient: RECIPIENT,
        slippageBps: 100,
        deadline: Math.floor(Date.now() / 1000) + 1200,
      })
    ).rejects.toThrow(/no pool exists/i);
  });

  it("throws a clear error when the pool has no on-chain liquidity yet", async () => {
    const uninitializedClient = {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
        if (functionName === "getPool") return POOL;
        if (functionName === "slot0") return [0n, 0, 0, 0, 0, 0, false] as const;
        if (functionName === "liquidity") return 0n;
        throw new Error(`unmocked call: ${functionName}`);
      }),
    } as unknown as PublicClient;

    await expect(
      buildAddLiquidityV3({
        client: uninitializedClient,
        tokenA: TOKEN_A,
        tokenADecimals: 18,
        tokenASymbol: "TOKA",
        tokenB: TOKEN_B,
        tokenBDecimals: 18,
        tokenBSymbol: "TOKB",
        fee: 3000,
        amountAIn: 1000_000000000000000000n,
        recipient: RECIPIENT,
        slippageBps: 100,
        deadline: Math.floor(Date.now() / 1000) + 1200,
      })
    ).rejects.toThrow(/no on-chain liquidity/);
  });

  it("sorts token0/token1 the same way when tokenA is numerically greater than tokenB", async () => {
    expect(BigInt(TOKEN_B) > BigInt(TOKEN_A)).toBe(true);
    // Swap which side is "A" vs the first test, to exercise the other sort order.
    const built = await buildAddLiquidityV3({
      client: mockClient(),
      tokenA: TOKEN_B,
      tokenADecimals: 18,
      tokenASymbol: "TOKB",
      tokenB: TOKEN_A,
      tokenBDecimals: 18,
      tokenBSymbol: "TOKA",
      fee: 3000,
      amountAIn: 500_000000000000000000n,
      recipient: RECIPIENT,
      slippageBps: 50,
      deadline: Math.floor(Date.now() / 1000) + 1200,
    });
    expect(BigInt(built.amountARequired)).toBeGreaterThan(0n);
    expect(BigInt(built.amountBRequired)).toBeGreaterThan(0n);
  });

  it("rejects an unsupported fee tier before touching the chain", async () => {
    const client = mockClient();
    await expect(
      buildAddLiquidityV3({
        client,
        tokenA: TOKEN_A,
        tokenADecimals: 18,
        tokenASymbol: "TOKA",
        tokenB: TOKEN_B,
        tokenBDecimals: 18,
        tokenBSymbol: "TOKB",
        fee: 1234,
        amountAIn: 1000n,
        recipient: RECIPIENT,
        slippageBps: 100,
        deadline: Math.floor(Date.now() / 1000) + 1200,
      })
    ).rejects.toThrow(/unsupported fee tier/i);
  });
});
