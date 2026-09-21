import { describe, expect, it } from "vitest";
import { aggregateWallets } from "./smart-money";
import type { Trade } from "./geckoterminal";

const WALLET_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WALLET_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TOKEN_1 = "0x1111111111111111111111111111111111111111";
const TOKEN_2 = "0x2222222222222222222222222222222222222222";

function trade(overrides: Partial<Trade>): Trade {
  return {
    txHash: null,
    traderAddress: null,
    kind: null,
    volumeUsd: null,
    fromTokenAmount: null,
    toTokenAmount: null,
    priceUsd: null,
    blockTimestamp: null,
    ageSeconds: null,
    poolAddress: "0xpool",
    baseToken: { address: TOKEN_1, symbol: "FOO", name: "Foo", imageUrl: null },
    quoteToken: { address: null, symbol: "WETH", name: "Wrapped ETH", imageUrl: null },
    ...overrides,
  };
}

describe("aggregateWallets", () => {
  it("computes realized PnL only for a token where both sides are visible", () => {
    const trades = [
      trade({ traderAddress: WALLET_A, kind: "buy", volumeUsd: 1000, baseToken: { address: TOKEN_1, symbol: "FOO", name: "Foo", imageUrl: null } }),
      trade({ traderAddress: WALLET_A, kind: "sell", volumeUsd: 1500, baseToken: { address: TOKEN_1, symbol: "FOO", name: "Foo", imageUrl: null } }),
    ];

    const [wallet] = aggregateWallets(trades);
    expect(wallet.address).toBe(WALLET_A);
    expect(wallet.realizedPnlUsd).toBe(500);
    expect(wallet.wins).toBe(1);
    expect(wallet.losses).toBe(0);
    // buyVolumeUsd(1000) - sellVolumeUsd(1500): net flow is about dollars
    // moved, not profit — this wallet sold more than it bought, negative
    // even though the round-trip itself was profitable.
    expect(wallet.netFlowUsd).toBe(-500);
  });

  it("treats a buy-only token as flow, not a win or a loss", () => {
    const trades = [
      trade({ traderAddress: WALLET_A, kind: "buy", volumeUsd: 2000, baseToken: { address: TOKEN_2, symbol: "BAR", name: "Bar", imageUrl: null } }),
    ];

    const [wallet] = aggregateWallets(trades);
    expect(wallet.realizedPnlUsd).toBe(0);
    expect(wallet.wins).toBe(0);
    expect(wallet.losses).toBe(0);
    expect(wallet.netFlowUsd).toBe(2000);
    expect(wallet.tokens).toBe(1);
  });

  it("counts a losing round-trip separately from a winning one", () => {
    const trades = [
      trade({ traderAddress: WALLET_A, kind: "buy", volumeUsd: 1000, baseToken: { address: TOKEN_1, symbol: "FOO", name: "Foo", imageUrl: null } }),
      trade({ traderAddress: WALLET_A, kind: "sell", volumeUsd: 400, baseToken: { address: TOKEN_1, symbol: "FOO", name: "Foo", imageUrl: null } }),
    ];

    const [wallet] = aggregateWallets(trades);
    expect(wallet.realizedPnlUsd).toBe(-600);
    expect(wallet.wins).toBe(0);
    expect(wallet.losses).toBe(1);
  });

  it("keeps separate wallets and separate tokens apart", () => {
    const trades = [
      trade({ traderAddress: WALLET_A, kind: "buy", volumeUsd: 100, baseToken: { address: TOKEN_1, symbol: "FOO", name: "Foo", imageUrl: null } }),
      trade({ traderAddress: WALLET_B, kind: "buy", volumeUsd: 200, baseToken: { address: TOKEN_1, symbol: "FOO", name: "Foo", imageUrl: null } }),
      trade({ traderAddress: WALLET_A, kind: "buy", volumeUsd: 300, baseToken: { address: TOKEN_2, symbol: "BAR", name: "Bar", imageUrl: null } }),
    ];

    const byAddress = new Map(aggregateWallets(trades).map((w) => [w.address, w]));
    expect(byAddress.get(WALLET_A)?.tokens).toBe(2);
    expect(byAddress.get(WALLET_A)?.buyVolumeUsd).toBe(400);
    expect(byAddress.get(WALLET_B)?.tokens).toBe(1);
    expect(byAddress.get(WALLET_B)?.buyVolumeUsd).toBe(200);
  });

  it("ignores trades with no trader address or no side", () => {
    const trades = [
      trade({ traderAddress: null, kind: "buy", volumeUsd: 1000 }),
      trade({ traderAddress: WALLET_A, kind: null, volumeUsd: 1000 }),
    ];
    expect(aggregateWallets(trades)).toEqual([]);
  });

  it("sorts by realized PnL first, then net flow", () => {
    const trades = [
      // Wallet A: closed, +500 realized.
      trade({ traderAddress: WALLET_A, kind: "buy", volumeUsd: 1000, baseToken: { address: TOKEN_1, symbol: "FOO", name: "Foo", imageUrl: null } }),
      trade({ traderAddress: WALLET_A, kind: "sell", volumeUsd: 1500, baseToken: { address: TOKEN_1, symbol: "FOO", name: "Foo", imageUrl: null } }),
      // Wallet B: nothing closed, but a bigger net accumulation.
      trade({ traderAddress: WALLET_B, kind: "buy", volumeUsd: 9000, baseToken: { address: TOKEN_2, symbol: "BAR", name: "Bar", imageUrl: null } }),
    ];

    const ranked = aggregateWallets(trades);
    expect(ranked[0].address).toBe(WALLET_A);
    expect(ranked[1].address).toBe(WALLET_B);
  });
});
