import { describe, expect, it } from "vitest";
import { aggregateIndexedWallets } from "./indexed-smart-money";

const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const TOKEN_A = "0x1111111111111111111111111111111111111111";
const TOKEN_B = "0x2222222222222222222222222222222222222222";
const WALLET_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WALLET_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("aggregateIndexedWallets", () => {
  it("computes realized PnL in ETH from a buy then a sell, attributed by recipient", () => {
    const results = aggregateIndexedWallets(
      [
        { recipient: WALLET_A, amount0: "1000000000000000000", amount1: "-500000000000000000000", token0: WETH, token1: TOKEN_A },
        { recipient: WALLET_A, amount0: "-1500000000000000000", amount1: "500000000000000000000", token0: WETH, token1: TOKEN_A },
      ],
      WETH
    );

    expect(results).toHaveLength(1);
    expect(results[0].wallet).toBe(WALLET_A.toLowerCase());
    expect(results[0].realizedPnlEth).toBeCloseTo(0.5, 10);
    expect(results[0].wins).toBe(1);
    expect(results[0].losses).toBe(0);
    expect(results[0].trades).toBe(2);
    expect(results[0].tokensTraded).toBe(1);
  });

  it("keeps separate wallets apart", () => {
    const results = aggregateIndexedWallets(
      [
        { recipient: WALLET_A, amount0: "1000000000000000000", amount1: "-500000000000000000000", token0: WETH, token1: TOKEN_A },
        { recipient: WALLET_B, amount0: "2000000000000000000", amount1: "-100000000000000000000", token0: WETH, token1: TOKEN_B },
      ],
      WETH
    );

    expect(results).toHaveLength(2);
    const byWallet = new Map(results.map((r) => [r.wallet, r]));
    expect(byWallet.get(WALLET_A.toLowerCase())?.netFlowEth).toBeCloseTo(-1, 10);
    expect(byWallet.get(WALLET_B.toLowerCase())?.netFlowEth).toBeCloseTo(-2, 10);
  });

  it("ranks a winner above an unrated wallet above a loser", () => {
    const results = aggregateIndexedWallets(
      [
        // WALLET_A: closed, +0.5 ETH profit.
        { recipient: WALLET_A, amount0: "1000000000000000000", amount1: "-500000000000000000000", token0: WETH, token1: TOKEN_A },
        { recipient: WALLET_A, amount0: "-1500000000000000000", amount1: "500000000000000000000", token0: WETH, token1: TOKEN_A },
        // WALLET_B: only a buy visible, nothing closed.
        { recipient: WALLET_B, amount0: "9000000000000000000", amount1: "-100000000000000000000", token0: WETH, token1: TOKEN_B },
      ],
      WETH
    );

    expect(results[0].wallet).toBe(WALLET_A.toLowerCase());
    expect(results[1].wallet).toBe(WALLET_B.toLowerCase());
  });

  it("skips a swap where neither leg is WETH", () => {
    const results = aggregateIndexedWallets(
      [{ recipient: WALLET_A, amount0: "1000000", amount1: "-2000000", token0: TOKEN_A, token1: TOKEN_B }],
      WETH
    );
    expect(results).toHaveLength(0);
  });
});
