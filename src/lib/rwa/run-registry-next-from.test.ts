import { describe, expect, it } from "vitest";
import { nextFrom } from "./run-registry";

describe("nextFrom", () => {
  it("bootstraps a fresh checkpoint to headBlock - LOOKBACK_BLOCKS (default 2,000,000)", () => {
    const head = 10_000_000n;
    expect(nextFrom(0n, head)).toBe(head - 2_000_000n);
  });

  it("never scans below block 0 on a fresh checkpoint near genesis", () => {
    expect(nextFrom(0n, 1_000_000n)).toBe(0n);
  });

  it("continues from synced + 1 once a checkpoint exists, even far behind head", () => {
    // The bug this guards: falling more than LOOKBACK_BLOCKS behind used
    // to re-clamp forward to headBlock - LOOKBACK_BLOCKS every run,
    // permanently skipping the unscanned range in between. It must not.
    const synced = 1_000_000n;
    const farAheadHead = synced + 50_000_000n;
    expect(nextFrom(synced, farAheadHead)).toBe(synced + 1n);
  });

  it("keeps advancing by exactly synced + 1 across consecutive runs regardless of head growth", () => {
    let synced = 1_000_000n;
    let head = 20_000_000n;
    for (let i = 0; i < 5; i++) {
      const from = nextFrom(synced, head);
      expect(from).toBe(synced + 1n);
      synced = from + 299_999n; // pretend this run scanned 300,000 blocks
      head += 860_000n; // chain kept growing faster than the scan
    }
  });
});
