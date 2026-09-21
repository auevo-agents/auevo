import { describe, expect, it } from "vitest";
import { computeWalletPnl } from "./wallet-pnl";

const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const TOKEN_A = "0x1111111111111111111111111111111111111111";
const TOKEN_B = "0x2222222222222222222222222222222222222222";
const STABLE = "0x3333333333333333333333333333333333333333"; // not WETH-paired

describe("computeWalletPnl", () => {
  it("computes ETH-denominated realized PnL from a buy then a sell of the same token", () => {
    const summary = computeWalletPnl(
      [
        // Buy: paid 1 WETH (token0, positive/pool received), received TOKEN_A (token1, negative/pool paid out).
        { amount0: "1000000000000000000", amount1: "-500000000000000000000", token0: WETH, token1: TOKEN_A },
        // Sell: paid TOKEN_A (positive), received 1.5 WETH (negative).
        { amount0: "-1500000000000000000", amount1: "500000000000000000000", token0: WETH, token1: TOKEN_A },
      ],
      WETH
    );

    expect(summary.realizedPnlEth).toBeCloseTo(0.5, 10);
    expect(summary.wins).toBe(1);
    expect(summary.losses).toBe(0);
    expect(summary.tokensTraded).toBe(1);
  });

  it("does not count a buy-only token toward win rate", () => {
    const summary = computeWalletPnl(
      [{ amount0: "1000000000000000000", amount1: "-500000000000000000000", token0: WETH, token1: TOKEN_A }],
      WETH
    );
    expect(summary.realizedPnlEth).toBe(0);
    expect(summary.wins).toBe(0);
    expect(summary.losses).toBe(0);
    expect(summary.tokensTraded).toBe(1);
  });

  it("skips a swap where neither leg is WETH", () => {
    const summary = computeWalletPnl(
      [{ amount0: "1000000", amount1: "-2000000", token0: STABLE, token1: TOKEN_B }],
      WETH
    );
    expect(summary.tokensTraded).toBe(0);
  });

  it("handles WETH as either token0 or token1 the same way", () => {
    const a = computeWalletPnl(
      [
        { amount0: "1000000000000000000", amount1: "-500000000000000000000", token0: WETH, token1: TOKEN_A },
        { amount0: "-1500000000000000000", amount1: "500000000000000000000", token0: WETH, token1: TOKEN_A },
      ],
      WETH
    );
    const b = computeWalletPnl(
      [
        { amount1: "1000000000000000000", amount0: "-500000000000000000000", token1: WETH, token0: TOKEN_A },
        { amount1: "-1500000000000000000", amount0: "500000000000000000000", token1: WETH, token0: TOKEN_A },
      ],
      WETH
    );
    expect(b.realizedPnlEth).toBeCloseTo(a.realizedPnlEth, 10);
    expect(b.wins).toBe(a.wins);
  });

  it("counts a losing round-trip as a loss, not a win", () => {
    const summary = computeWalletPnl(
      [
        { amount0: "1000000000000000000", amount1: "-500000000000000000000", token0: WETH, token1: TOKEN_A },
        { amount0: "-400000000000000000", amount1: "500000000000000000000", token0: WETH, token1: TOKEN_A },
      ],
      WETH
    );
    expect(summary.realizedPnlEth).toBeCloseTo(-0.6, 10);
    expect(summary.wins).toBe(0);
    expect(summary.losses).toBe(1);
  });
});
