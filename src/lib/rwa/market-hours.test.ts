import { describe, expect, it } from "vitest";
import { marketStatus, isRegularSession } from "./market-hours";

// All times chosen as UTC instants and cross-checked against their known
// America/New_York local time (EST = UTC-5, EDT = UTC-4) rather than
// constructed from NY-local strings, so the test itself doesn't share any
// timezone-conversion logic with the code under test.

describe("marketStatus", () => {
  it("is open during a regular Tuesday session (EST, winter)", () => {
    // 2026-01-06 is a Tuesday, no holiday. 15:00 UTC = 10:00am EST.
    expect(marketStatus(new Date("2026-01-06T15:00:00Z"))).toBe("open");
  });

  it("is open during a regular session in summer (EDT)", () => {
    // 2026-06-16 is a Tuesday. 15:00 UTC = 11:00am EDT.
    expect(marketStatus(new Date("2026-06-16T15:00:00Z"))).toBe("open");
  });

  it("is pre-market before 9:30am ET", () => {
    // 2026-01-06 09:00 UTC = 4:00am EST (right at pre-market open).
    expect(marketStatus(new Date("2026-01-06T09:00:00Z"))).toBe("pre-market");
  });

  it("is closed before 4:00am ET", () => {
    // 2026-01-06 08:00 UTC = 3:00am EST.
    expect(marketStatus(new Date("2026-01-06T08:00:00Z"))).toBe("closed");
  });

  it("is after-hours between 4:00pm and 8:00pm ET", () => {
    // 2026-01-06 22:00 UTC = 5:00pm EST.
    expect(marketStatus(new Date("2026-01-06T22:00:00Z"))).toBe("after-hours");
  });

  it("is closed after 8:00pm ET", () => {
    // 2026-01-06 02:00 UTC (next day) = 9:00pm EST.
    expect(marketStatus(new Date("2026-01-07T02:00:00Z"))).toBe("closed");
  });

  it("is closed on a weekend", () => {
    // 2026-01-10 is a Saturday. 15:00 UTC = 10:00am EST.
    expect(marketStatus(new Date("2026-01-10T15:00:00Z"))).toBe("closed");
  });

  it("is closed on a full-closure holiday (New Year's Day 2026)", () => {
    expect(marketStatus(new Date("2026-01-01T15:00:00Z"))).toBe("closed");
  });

  it("is closed on Juneteenth 2026", () => {
    expect(marketStatus(new Date("2026-06-19T15:00:00Z"))).toBe("closed");
  });

  it("treats the observed Independence Day (2026-07-03) as closed", () => {
    expect(marketStatus(new Date("2026-07-03T15:00:00Z"))).toBe("closed");
  });

  it("respects an early close (day after Thanksgiving 2026) — open shrinks to 1:00pm ET", () => {
    // 2026-11-27, 17:30 UTC = 12:30pm EST — still open under early close.
    expect(marketStatus(new Date("2026-11-27T17:30:00Z"))).toBe("open");
    // 2026-11-27, 18:30 UTC = 1:30pm EST — closed under early close, though
    // a normal day would still be in its regular session at this hour.
    expect(marketStatus(new Date("2026-11-27T18:30:00Z"))).toBe("after-hours");
  });

  it("returns null for a year outside the known calendar table", () => {
    expect(marketStatus(new Date("2030-01-08T15:00:00Z"))).toBeNull();
  });

  it("handles a second holiday/early-close year (2027) correctly", () => {
    // 2027-01-01 is a Friday holiday (New Year's Day).
    expect(marketStatus(new Date("2027-01-01T15:00:00Z"))).toBe("closed");
  });
});

describe("isRegularSession", () => {
  it("is true only when marketStatus is 'open'", () => {
    expect(isRegularSession(new Date("2026-01-06T15:00:00Z"))).toBe(true);
    expect(isRegularSession(new Date("2026-01-06T09:00:00Z"))).toBe(false);
    expect(isRegularSession(new Date("2026-01-10T15:00:00Z"))).toBe(false);
  });
});
