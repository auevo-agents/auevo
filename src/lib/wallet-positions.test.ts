import { describe, expect, it } from "vitest";
import { aggregatePositions, evaluatePosition } from "./wallet-positions";

const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const TOKEN_A = "0x1111111111111111111111111111111111111111";

function decimalsOf(token: string): number {
  return token.toLowerCase() === WETH.toLowerCase() ? 18 : 18;
}

describe("aggregatePositions + evaluatePosition", () => {
  it("computes average cost and unrealized PnL for an open (never-sold) position", () => {
    // Bought 500 TOKEN_A for 1 WETH total -> avg cost 0.002 WETH/unit.
    const positions = aggregatePositions(
      [
        {
          amount0: "1000000000000000000",
          amount1: "-500000000000000000000",
          token0: WETH,
          token1: TOKEN_A,
          tick: 0,
          blockNumber: 100,
        },
      ],
      WETH,
      decimalsOf
    );

    const pos = positions.get(TOKEN_A.toLowerCase());
    expect(pos).toBeDefined();
    expect(pos!.buyUnits).toBeCloseTo(500, 6);
    expect(pos!.buyEth).toBeCloseTo(1, 10);

    // Still holding all 500 units, current price still 1:1 raw at tick 0
    // (both 18 decimals, WETH is token0) -> price of TOKEN_A in WETH = 1.
    const view = evaluatePosition(pos!, 500);
    expect(view.avgCostWeth).toBeCloseTo(0.002, 10);
    expect(view.costBasisWeth).toBeCloseTo(1, 10);
    expect(view.currentPriceWeth).toBeCloseTo(1, 10);
    expect(view.currentValueWeth).toBeCloseTo(500, 6);
    // Bought 500 units for 1 ETH total, now worth 500 ETH at tick-0 parity — a huge unrealized gain, by construction of this fixture.
    expect(view.unrealizedPnlWeth).toBeCloseTo(499, 0);
    expect(view.realizedPnlWeth).toBeNull();
  });

  it("returns no cost basis for a position with zero recorded buys", () => {
    const positions = aggregatePositions(
      [
        {
          amount0: "-1000000000000000000",
          amount1: "500000000000000000000",
          token0: WETH,
          token1: TOKEN_A,
          tick: 0,
          blockNumber: 100,
        },
      ],
      WETH,
      decimalsOf
    );
    const pos = positions.get(TOKEN_A.toLowerCase())!;
    const view = evaluatePosition(pos, 0);
    expect(view.avgCostWeth).toBeNull();
    expect(view.costBasisWeth).toBeNull();
    expect(view.unrealizedPnlWeth).toBeNull();
  });

  it("uses the chronologically latest swap's tick for the mark price", () => {
    const positions = aggregatePositions(
      [
        { amount0: "1000000000000000000", amount1: "-500000000000000000000", token0: WETH, token1: TOKEN_A, tick: 0, blockNumber: 100 },
        { amount0: "1000000000000000000", amount1: "-100000000000000000000", token0: WETH, token1: TOKEN_A, tick: 6932, blockNumber: 200 },
      ],
      WETH,
      decimalsOf
    );
    const pos = positions.get(TOKEN_A.toLowerCase())!;
    expect(pos.latestTick).toBe(6932);
    expect(pos.latestBlock).toBe(200);
  });
});
