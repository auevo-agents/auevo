import { describe, expect, it } from "vitest";
import { checkPremiumAlerts, checkListingAlerts, checkWhaleAlerts, type AlertRow } from "./alerts";

function alert(overrides: Partial<AlertRow>): AlertRow {
  return { id: 1, account: "0xabc", type: "premium", params: {}, channel: "web", ...overrides };
}

describe("checkPremiumAlerts", () => {
  it("fires when premiumBps exceeds the threshold", () => {
    const fired = checkPremiumAlerts(
      [alert({ id: 1, params: { ticker: "NVDA", thresholdBps: 200 } })],
      new Map([["NVDA", 350]]),
      "2026-09-26"
    );
    expect(fired).toEqual([{ alertId: 1, dedupeKey: "2026-09-26", message: expect.stringContaining("NVDA") }]);
  });

  it("does not fire when premium is at or below the threshold", () => {
    const fired = checkPremiumAlerts(
      [alert({ id: 1, params: { ticker: "NVDA", thresholdBps: 200 } })],
      new Map([["NVDA", 200]]),
      "2026-09-26"
    );
    expect(fired).toEqual([]);
  });

  it("does not fire on a negative premium (discount), even a large one", () => {
    const fired = checkPremiumAlerts(
      [alert({ id: 1, params: { ticker: "NVDA", thresholdBps: 200 } })],
      new Map([["NVDA", -500]]),
      "2026-09-26"
    );
    expect(fired).toEqual([]);
  });

  it("ignores an alert with no known premium for its ticker", () => {
    const fired = checkPremiumAlerts([alert({ id: 1, params: { ticker: "NVDA", thresholdBps: 200 } })], new Map(), "2026-09-26");
    expect(fired).toEqual([]);
  });

  it("ignores alerts of a different type or malformed params", () => {
    const fired = checkPremiumAlerts(
      [alert({ id: 1, type: "whale", params: { ticker: "NVDA", thresholdBps: 200 } }), alert({ id: 2, params: { ticker: "NVDA" } })],
      new Map([["NVDA", 999]]),
      "2026-09-26"
    );
    expect(fired).toEqual([]);
  });
});

describe("checkListingAlerts", () => {
  const listings = [
    { ticker: "NVDA", address: "0x1111111111111111111111111111111111111111", issuerId: "robinhood", discoveredAt: "2026-09-26T00:00:00Z" },
    { ticker: "TSLA", address: "0x2222222222222222222222222222222222222222", issuerId: "xstocks", discoveredAt: "2026-09-26T00:00:00Z" },
  ];

  it("fires for any new listing when no ticker filter is given", () => {
    const fired = checkListingAlerts([alert({ id: 1, type: "listing", params: {} })], listings);
    expect(fired).toHaveLength(2);
    expect(fired.map((f) => f.dedupeKey)).toEqual([listings[0].address.toLowerCase(), listings[1].address.toLowerCase()]);
  });

  it("fires only for the watched ticker when one is given", () => {
    const fired = checkListingAlerts([alert({ id: 1, type: "listing", params: { ticker: "tsla" } })], listings);
    expect(fired).toHaveLength(1);
    expect(fired[0].message).toContain("TSLA");
  });
});

describe("checkWhaleAlerts", () => {
  it("fires only for trades at or above minUsd on the watched ticker", () => {
    const fired = checkWhaleAlerts(
      [alert({ id: 1, type: "whale", params: { ticker: "NVDA", minUsd: 50_000 } })],
      [
        { ticker: "NVDA", usdAmount: 60_000, txHash: "0xaaa" },
        { ticker: "NVDA", usdAmount: 10_000, txHash: "0xbbb" },
        { ticker: "TSLA", usdAmount: 100_000, txHash: "0xccc" },
      ]
    );
    expect(fired).toEqual([{ alertId: 1, dedupeKey: "0xaaa", message: expect.stringContaining("NVDA") }]);
  });
});
