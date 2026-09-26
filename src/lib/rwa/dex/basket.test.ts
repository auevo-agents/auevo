import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { CommandParser, CommandType } from "@uniswap/universal-router-sdk";
import { buildBasketSwap, type BasketLeg } from "./basket";
import { USDG, UNIVERSAL_ROUTER } from "./addresses";
import { buildPoolKey } from "./pool-key";

const STOCK_A: Address = "0x1111111111111111111111111111111111111111";
const STOCK_B: Address = "0x2222222222222222222222222222222222222222";
const STOCK_C: Address = "0x3333333333333333333333333333333333333333";
const V3_POOL: Address = "0xabc0000000000000000000000000000000000abc";
const RECIPIENT: Address = "0x9999999999999999999999999999999999999999";
const FEE_RECIPIENT: Address = "0x8888888888888888888888888888888888888888";

function v4Leg(tokenOut: Address, amountIn: bigint, amountOut: bigint): BasketLeg {
  return {
    quote: {
      protocol: "v4",
      tokenIn: USDG,
      tokenOut,
      poolKey: buildPoolKey(USDG, tokenOut, 3000, 60),
      zeroForOne: BigInt(USDG) < BigInt(tokenOut),
      amountOut,
    },
    amountIn,
    amountOutMinimum: (amountOut * 99n) / 100n,
  };
}

function v3Leg(tokenOut: Address, amountIn: bigint, amountOut: bigint): BasketLeg {
  return {
    quote: { protocol: "v3", tokenIn: USDG, tokenOut, fee: 3000, poolAddress: V3_POOL, amountOut },
    amountIn,
    amountOutMinimum: (amountOut * 99n) / 100n,
  };
}

describe("buildBasketSwap", () => {
  it("batches multiple v4 legs into one V4_SWAP command sharing a single settlement", () => {
    const legs = [
      v4Leg(STOCK_A, 1000_000000n, 10_000000000000000000n),
      v4Leg(STOCK_B, 2000_000000n, 20_000000000000000000n),
      v4Leg(STOCK_C, 3000_000000n, 30_000000000000000000n),
    ];

    const built = buildBasketSwap({
      legs,
      recipient: RECIPIENT,
      deadline: Math.floor(Date.now() / 1000) + 600,
      feeBps: 30,
      feeRecipient: FEE_RECIPIENT,
    });

    expect(built.to.toLowerCase()).toBe(UNIVERSAL_ROUTER.toLowerCase());
    expect(built.value).toBe(0n);

    const parsed = CommandParser.parseCalldata(built.data);
    const commandTypes = parsed.commands.map((c: { commandType: CommandType }) => c.commandType);

    // Exactly one V4_SWAP command for all three legs, one shared
    // PERMIT2_TRANSFER_FROM ingress (all legs share the USDG input), and
    // one PAY_PORTION + SWEEP per distinct output token.
    expect(commandTypes.filter((t) => t === CommandType.V4_SWAP)).toHaveLength(1);
    expect(commandTypes.filter((t) => t === CommandType.PERMIT2_TRANSFER_FROM)).toHaveLength(1);
    expect(commandTypes.filter((t) => t === CommandType.PAY_PORTION)).toHaveLength(3);
    expect(commandTypes.filter((t) => t === CommandType.SWEEP)).toHaveLength(3);
  });

  it("mixes v3 and v4 legs in one plan, each v3 leg as its own V3_SWAP_EXACT_IN command", () => {
    const legs = [
      v4Leg(STOCK_A, 1000_000000n, 10_000000000000000000n),
      v3Leg(STOCK_B, 2000_000000n, 20_000000000000000000n),
    ];

    const built = buildBasketSwap({
      legs,
      recipient: RECIPIENT,
      deadline: Math.floor(Date.now() / 1000) + 600,
      feeBps: 30,
      feeRecipient: FEE_RECIPIENT,
    });

    const parsed = CommandParser.parseCalldata(built.data);
    const commandTypes = parsed.commands.map((c: { commandType: CommandType }) => c.commandType);
    expect(commandTypes).toContain(CommandType.V4_SWAP);
    expect(commandTypes.filter((t) => t === CommandType.V3_SWAP_EXACT_IN)).toHaveLength(1);
  });

  it("sums a shared output currency into one PAY_PORTION/SWEEP pair instead of compounding the fee (sell-shaped: many inputs, one output)", () => {
    // A sell: every leg's *output* is USDG (modeled here directly as the tokenOut for each quote).
    const legs: BasketLeg[] = [
      {
        quote: {
          protocol: "v4",
          tokenIn: STOCK_A,
          tokenOut: USDG,
          poolKey: buildPoolKey(STOCK_A, USDG, 3000, 60),
          zeroForOne: BigInt(STOCK_A) < BigInt(USDG),
          amountOut: 1000_000000n,
        },
        amountIn: 10_000000000000000000n,
        amountOutMinimum: 990_000000n,
      },
      {
        quote: {
          protocol: "v4",
          tokenIn: STOCK_B,
          tokenOut: USDG,
          poolKey: buildPoolKey(STOCK_B, USDG, 3000, 60),
          zeroForOne: BigInt(STOCK_B) < BigInt(USDG),
          amountOut: 2000_000000n,
        },
        amountIn: 20_000000000000000000n,
        amountOutMinimum: 1980_000000n,
      },
    ];

    const built = buildBasketSwap({
      legs,
      recipient: RECIPIENT,
      deadline: Math.floor(Date.now() / 1000) + 600,
      feeBps: 30,
      feeRecipient: FEE_RECIPIENT,
    });

    const parsed = CommandParser.parseCalldata(built.data);
    const commandTypes = parsed.commands.map((c: { commandType: CommandType }) => c.commandType);
    // Two distinct input tokens -> two PERMIT2_TRANSFER_FROM (one per input currency)...
    expect(commandTypes.filter((t) => t === CommandType.PERMIT2_TRANSFER_FROM)).toHaveLength(2);
    // ...but one shared USDG output -> exactly one PAY_PORTION and one SWEEP, not two.
    expect(commandTypes.filter((t) => t === CommandType.PAY_PORTION)).toHaveLength(1);
    expect(commandTypes.filter((t) => t === CommandType.SWEEP)).toHaveLength(1);
  });

  it("includes a PERMIT2_PERMIT command only for legs that were given one", () => {
    const legWithPermit: BasketLeg = {
      ...v4Leg(STOCK_A, 1000_000000n, 10_000000000000000000n),
      permit: {
        details: { token: USDG, amount: "3000000000", expiration: 1893456000, nonce: 3 },
        spender: UNIVERSAL_ROUTER,
        sigDeadline: Math.floor(Date.now() / 1000) + 600,
        signature: "0x" + "ab".repeat(32) + "3d".repeat(32) + "1b",
      },
    };
    const legWithoutPermit = v4Leg(STOCK_B, 2000_000000n, 20_000000000000000000n);

    const built = buildBasketSwap({
      legs: [legWithPermit, legWithoutPermit],
      recipient: RECIPIENT,
      deadline: Math.floor(Date.now() / 1000) + 600,
      feeBps: 30,
      feeRecipient: FEE_RECIPIENT,
    });

    const parsed = CommandParser.parseCalldata(built.data);
    const commandTypes = parsed.commands.map((c: { commandType: CommandType }) => c.commandType);
    expect(commandTypes.filter((t) => t === CommandType.PERMIT2_PERMIT)).toHaveLength(1);
  });

  it("throws with no legs rather than building a no-op transaction", () => {
    expect(() =>
      buildBasketSwap({
        legs: [],
        recipient: RECIPIENT,
        deadline: Math.floor(Date.now() / 1000) + 600,
        feeBps: 30,
        feeRecipient: FEE_RECIPIENT,
      })
    ).toThrow();
  });
});
