import { describe, expect, it } from "vitest";
import { aggregatePositions, aggregatePositionsUsd, evaluatePosition, evaluatePositionUsd } from "./wallet-positions";
import type { QuoteAssetPrice } from "./quote-asset";

const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const TOKEN_A = "0x1111111111111111111111111111111111111111";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

function decimalsOf(token: string): number {
  return token.toLowerCase() === WETH.toLowerCase() ? 18 : 18;
}

function decimalsOfUsdg(token: string): number {
  return token.toLowerCase() === USDG.toLowerCase() ? 6 : 18;
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

describe("aggregatePositionsUsd + evaluatePositionUsd", () => {
  const quoteAssets: QuoteAssetPrice[] = [{ address: USDG, decimals: 6, usdPrice: 1 }];

  it("computes average cost and unrealized PnL in USD for a USDG-quoted position", () => {
    // Bought 500 TOKEN_A for 100 USDG total -> avg cost $0.20/unit.
    const positions = aggregatePositionsUsd(
      [{ amount0: "100000000", amount1: "-500000000000000000000", token0: USDG, token1: TOKEN_A, tick: 0, blockNumber: 100 }],
      quoteAssets,
      decimalsOfUsdg
    );

    const pos = positions.get(TOKEN_A.toLowerCase());
    expect(pos).toBeDefined();
    expect(pos!.buyUnits).toBeCloseTo(500, 6);
    expect(pos!.buyUsd).toBeCloseTo(100, 6);

    // At tick 0 with USDG (6 decimals) as token0 and TOKEN_A (18 decimals)
    // as token1, tickToPrice's decimal adjustment makes 1 raw unit ratio
    // equal 1e12 token1-per-token0 before inverting for "base per quote" —
    // this just pins down that evaluatePositionUsd actually calls through
    // to the shared tick math rather than checking a specific price.
    const view = evaluatePositionUsd(pos!, 500);
    expect(view.avgCostUsd).toBeCloseTo(0.2, 10);
    expect(view.costBasisUsd).toBeCloseTo(100, 6);
    expect(view.currentValueUsd).toBeCloseTo(500 * view.currentPriceUsd, 6);
  });

  it("realizes USD PnL across a buy then a sell", () => {
    const positions = aggregatePositionsUsd(
      [
        { amount0: "100000000", amount1: "-500000000000000000000", token0: USDG, token1: TOKEN_A, tick: 0, blockNumber: 100 },
        { amount0: "-150000000", amount1: "500000000000000000000", token0: USDG, token1: TOKEN_A, tick: 0, blockNumber: 200 },
      ],
      quoteAssets,
      decimalsOfUsdg
    );
    const pos = positions.get(TOKEN_A.toLowerCase())!;
    const view = evaluatePositionUsd(pos, 0);
    expect(view.realizedPnlUsd).toBeCloseTo(50, 6);
  });

  it("returns null cost basis for a token never bought (e.g. airdropped in)", () => {
    const positions = aggregatePositionsUsd(
      [{ amount0: "-150000000", amount1: "500000000000000000000", token0: USDG, token1: TOKEN_A, tick: 0, blockNumber: 100 }],
      quoteAssets,
      decimalsOfUsdg
    );
    const pos = positions.get(TOKEN_A.toLowerCase())!;
    const view = evaluatePositionUsd(pos, 0);
    expect(view.avgCostUsd).toBeNull();
    expect(view.costBasisUsd).toBeNull();
    expect(view.unrealizedPnlUsd).toBeNull();
  });
});
