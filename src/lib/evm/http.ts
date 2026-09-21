/**
 * Minimal JSON fetch for the external data sources.
 *
 * Every caller treats a failure here as "unknown", never as "fine", so
 * this deliberately returns null instead of throwing: a scanner that
 * upgrades its verdict because a third-party API timed out is worse than
 * one with no third-party API at all.
 */
export async function fetchJson<T>(
  url: string,
  timeoutMs: number
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tri-state read of the "0"/"1" string flags these APIs use.
 *
 * A missing field is null, and null is never treated as false anywhere
 * downstream. On a chain this young most fields come back empty, so
 * collapsing absent into "no risk" would turn silence into reassurance —
 * which is exactly how a scanner ends up blessing a rug.
 */
export function triState(value: unknown): boolean | null {
  if (value === "1" || value === 1 || value === true) return true;
  if (value === "0" || value === 0 || value === false) return false;
  return null;
}

/** Parses a decimal string like "0.05" into a number, or null. */
export function decimalOrNull(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
