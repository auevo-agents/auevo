/**
 * NYSE trading-session status — RWA_SPEC.md Phase 1's own market-hours
 * utility, used to flag premium/discount readings and swap warnings as
 * "outside regular trading hours" (Phase 2's SwapPanel already has a
 * hook for this warning; this is what feeds it).
 *
 * Session times confirmed against NYSE's own public hours page (regular
 * 9:30am-4:00pm ET, pre-market 4:00am-9:30am ET, after-hours
 * 4:00pm-8:00pm ET) — stable, unchanged for decades, not something that
 * needed a fresh per-year check.
 *
 * The holiday/early-close table below is NOT evergreen — it is sourced
 * from NYSE Group's own official "2026, 2027 and 2028 Holiday and Early
 * Closings Calendar" press release (ICE Investor Relations, published
 * 2025-12-23: ir.theice.com/press/news-details/2025/NYSE-Group-Announces-
 * 2026-2027-and-2028-Holiday-and-Early-Closings-Calendar), corroborated
 * against independent mirrors (GuruFocus, Mondovisione) since the primary
 * page itself was unreachable from this sandbox's network policy — the
 * same "can't personally verify, cross-checked via independent sources
 * instead" situation as the Uniswap v4 address research. Only 2026-2027
 * are populated; `marketStatus` treats an unlisted year as "holiday table
 * needs extending" and returns null rather than silently assuming every
 * day that year is a normal trading day.
 */

export type MarketStatus = "open" | "pre-market" | "after-hours" | "closed";

interface NyseCalendarYear {
  /** Full-closure dates, "YYYY-MM-DD". */
  holidays: string[];
  /** Early-close (1:00pm ET) dates, "YYYY-MM-DD". */
  earlyCloses: string[];
}

const NYSE_CALENDAR: Record<number, NyseCalendarYear> = {
  2026: {
    holidays: [
      "2026-01-01", // New Year's Day
      "2026-01-19", // Martin Luther King Jr. Day
      "2026-02-16", // Washington's Birthday
      "2026-04-03", // Good Friday
      "2026-05-25", // Memorial Day
      "2026-06-19", // Juneteenth
      "2026-07-03", // Independence Day (observed — July 4 falls on a Saturday)
      "2026-09-07", // Labor Day
      "2026-11-26", // Thanksgiving Day
      "2026-12-25", // Christmas Day
    ],
    earlyCloses: [
      "2026-11-27", // Day after Thanksgiving
      "2026-12-24", // Christmas Eve
    ],
  },
  2027: {
    holidays: [
      "2027-01-01", // New Year's Day
      "2027-01-18", // Martin Luther King Jr. Day
      "2027-02-15", // Washington's Birthday
      "2027-03-26", // Good Friday
      "2027-05-31", // Memorial Day
      "2027-06-18", // Juneteenth (observed — June 19 falls on a Saturday)
      "2027-07-05", // Independence Day (observed — July 4 falls on a Sunday)
      "2027-09-06", // Labor Day
      "2027-11-25", // Thanksgiving Day
      "2027-12-24", // Christmas Day (observed — December 25 falls on a Saturday)
    ],
    earlyCloses: [
      "2027-11-26", // Day after Thanksgiving
    ],
  },
};

const PRE_MARKET_START_MIN = 4 * 60; // 4:00am
const REGULAR_START_MIN = 9 * 60 + 30; // 9:30am
const REGULAR_END_MIN = 16 * 60; // 4:00pm
const EARLY_CLOSE_END_MIN = 13 * 60; // 1:00pm
const AFTER_HOURS_END_MIN = 20 * 60; // 8:00pm

interface NyParts {
  dateKey: string; // "YYYY-MM-DD"
  weekday: number; // 0 = Sunday
  minutesSinceMidnight: number;
}

function nyParts(date: Date): NyParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  // Intl's 24-hour format reports midnight as "24", not "00" — normalize.
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));

  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: weekdayMap[get("weekday")] ?? -1,
    minutesSinceMidnight: hour * 60 + minute,
  };
}

/**
 * Returns null when the given date falls in a year this table doesn't
 * cover yet — a deliberate "we don't know" rather than assuming a normal
 * trading day, since guessing wrong here means showing "open" or "closed"
 * confidently when it's actually the other one.
 */
export function marketStatus(date: Date = new Date()): MarketStatus | null {
  const { dateKey, weekday, minutesSinceMidnight } = nyParts(date);
  const year = Number(dateKey.slice(0, 4));
  const calendar = NYSE_CALENDAR[year];
  if (!calendar) return null;

  if (weekday === 0 || weekday === 6) return "closed"; // weekend
  if (calendar.holidays.includes(dateKey)) return "closed";

  const regularEnd = calendar.earlyCloses.includes(dateKey) ? EARLY_CLOSE_END_MIN : REGULAR_END_MIN;

  if (minutesSinceMidnight < PRE_MARKET_START_MIN) return "closed";
  if (minutesSinceMidnight < REGULAR_START_MIN) return "pre-market";
  if (minutesSinceMidnight < regularEnd) return "open";
  if (minutesSinceMidnight < AFTER_HOURS_END_MIN) return "after-hours";
  return "closed";
}

export function isRegularSession(date: Date = new Date()): boolean {
  return marketStatus(date) === "open";
}
