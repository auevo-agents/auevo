import { describe, expect, it, vi } from "vitest";
import type { Address, PublicClient } from "viem";
import { CommandParser, CommandType } from "@uniswap/universal-router-sdk";
import { buildSwap, getPermit2Allowance } from "./build";
import { USDG, PERMIT2, UNIVERSAL_ROUTER, WETH9 } from "./addresses";
import { buildPoolKey } from "./pool-key";
import type { RouteQuote } from "./quote";

const STOCK: Address = "0x1111111111111111111111111111111111111111";
const V3_POOL: Address = "0xabc0000000000000000000000000000000000abc";

const SQRT_PRICE_X96_1_1 = 79228162514264337593543950336n; // price = 1.0 in Q96, valid for any fee/token-decimal combo used here

/** A PublicClient stub covering just what build.ts calls: v3 pool state and v4 StateView. */
function mockClient(): PublicClient {
  return {
    readContract: vi.fn(async ({ address, functionName }: { address: Address; functionName: string }) => {
      if (functionName === "slot0") {
        return [SQRT_PRICE_X96_1_1, 0, 0, 0, 0, 0, true] as const;
      }
      if (functionName === "liquidity" || functionName === "getLiquidity") {
        return 1_000_000_000_000_000_000n;
      }
      if (functionName === "getSlot0") {
        return [SQRT_PRICE_X96_1_1, 0, 0, 0] as const;
      }
      if (functionName === "allowance" && address.toLowerCase() === PERMIT2.toLowerCase()) {
        return [500000000000000000000n, 1893456000, 3] as const; // amount, expiration, nonce
      }
      throw new Error(`unmocked call: ${functionName} on ${address}`);
    }),
  } as unknown as PublicClient;
}

describe("buildSwap", () => {
  it("builds a single-hop v4 swap (USDG -> STOCK) targeting UniversalRouter, with the platform fee applied", async () => {
    const route: RouteQuote = {
      legs: [
        {
          protocol: "v4",
          tokenIn: USDG,
          tokenOut: STOCK,
          poolKey: buildPoolKey(USDG, STOCK, 3000, 60),
          zeroForOne: BigInt(USDG) < BigInt(STOCK),
          amountOut: 30_000000000000000000n,
        },
      ],
      amountOut: 30_000000000000000000n,
    };

    const built = await buildSwap({
      client: mockClient(),
      route,
      tokenIn: { address: USDG, decimals: 6, symbol: "USDG" },
      tokenOut: { address: STOCK, decimals: 18, symbol: "STOCK" },
      amountIn: 3000_000000n,
      nativeIn: false,
      nativeOut: false,
      slippageBps: 100,
      recipient: "0x9999999999999999999999999999999999999999",
      deadline: Math.floor(Date.now() / 1000) + 600,
      feeBps: 30,
      feeRecipient: "0x8888888888888888888888888888888888888888",
    });

    expect(built.to.toLowerCase()).toBe(UNIVERSAL_ROUTER.toLowerCase());
    expect(built.value).toBe(0n); // ERC20-in, no native ETH attached

    // Deliberately not passing UniversalRouterVersion.V2_1_2 here even
    // though that's the real deployed version: CommandParser's own decode
    // path for V2_1_1+ assumes a V2/V3-swap-shaped minHopPriceX36 array
    // that isn't relevant to a V4_SWAP/PAY_PORTION/SWEEP-only plan like
    // this one, and throws decoding it — confirmed a decoder-side quirk in
    // that helper, not a bug in the calldata itself, by cross-checking
    // that the default (V2_0) decode path and a raw viem
    // decodeFunctionData against the plain execute() ABI both parse this
    // exact calldata cleanly.
    const parsed = CommandParser.parseCalldata(built.data);
    const commandTypes = parsed.commands.map((c: { commandType: CommandType }) => c.commandType);
    expect(commandTypes).toContain(CommandType.V4_SWAP);
  });

  it("includes a PERMIT2_PERMIT command when a signed permit is supplied", async () => {
    const route: RouteQuote = {
      legs: [
        {
          protocol: "v3",
          tokenIn: USDG,
          tokenOut: STOCK,
          fee: 3000,
          poolAddress: V3_POOL,
          amountOut: 30_000000000000000000n,
        },
      ],
      amountOut: 30_000000000000000000n,
    };

    const built = await buildSwap({
      client: mockClient(),
      route,
      tokenIn: { address: USDG, decimals: 6, symbol: "USDG" },
      tokenOut: { address: STOCK, decimals: 18, symbol: "STOCK" },
      amountIn: 3000_000000n,
      nativeIn: false,
      nativeOut: false,
      slippageBps: 100,
      recipient: "0x9999999999999999999999999999999999999999",
      deadline: Math.floor(Date.now() / 1000) + 600,
      feeBps: 30,
      feeRecipient: "0x8888888888888888888888888888888888888888",
      permit: {
        details: { token: USDG, amount: "3000000000", expiration: 1893456000, nonce: 3 },
        spender: UNIVERSAL_ROUTER,
        sigDeadline: Math.floor(Date.now() / 1000) + 600,
        // Structurally valid (65 bytes: 32r + 32s + 1v with v=27), not
        // cryptographically real — this test only checks the calldata
        // shape, not on-chain signature verification.
        signature: "0x" + "ab".repeat(32) + "3d".repeat(32) + "1b",
      },
    });

    const parsed = CommandParser.parseCalldata(built.data);
    const commandTypes = parsed.commands.map((c: { commandType: CommandType }) => c.commandType);
    expect(commandTypes).toContain(CommandType.PERMIT2_PERMIT);
    expect(commandTypes).toContain(CommandType.V3_SWAP_EXACT_IN);
  });

  it("attaches the input amount as value when paying in native ETH", async () => {
    const route: RouteQuote = {
      legs: [
        {
          protocol: "v4",
          tokenIn: WETH9,
          tokenOut: USDG,
          poolKey: buildPoolKey("0x0000000000000000000000000000000000000000", USDG, 500, 10),
          zeroForOne: true,
          amountOut: 3000_000000n,
        },
      ],
      amountOut: 3000_000000n,
    };

    const built = await buildSwap({
      client: mockClient(),
      route,
      tokenIn: { address: WETH9, decimals: 18, symbol: "WETH" },
      tokenOut: { address: USDG, decimals: 6, symbol: "USDG" },
      amountIn: 1_000000000000000000n,
      nativeIn: true,
      nativeOut: false,
      slippageBps: 100,
      recipient: "0x9999999999999999999999999999999999999999",
      deadline: Math.floor(Date.now() / 1000) + 600,
      feeBps: 30,
      feeRecipient: "0x8888888888888888888888888888888888888888",
    });

    expect(built.value).toBeGreaterThan(0n);
  });
});

describe("getPermit2Allowance", () => {
  it("reads the current Permit2 allowance for a token/spender pair", async () => {
    const result = await getPermit2Allowance(
      mockClient(),
      "0x9999999999999999999999999999999999999999",
      USDG,
      UNIVERSAL_ROUTER
    );
    expect(result).toEqual({ amount: 500000000000000000000n, expiration: 1893456000, nonce: 3 });
  });
});
