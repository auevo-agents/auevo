"use client";

/**
 * Per-browser quick-buy amounts, denominated in whatever the trade spends
 * (native ETH, or the pair's quote token) — the one-click "0.01 / 0.05"
 * style buttons every leader terminal (Axiom included) shows next to Buy,
 * so a user isn't typing an amount for every trade. Same localStorage
 * pattern as favorites.ts.
 */

const STORAGE_KEY = "auevo.quickBuyPresets";
export const DEFAULT_QUICK_BUY_PRESETS = ["0.005", "0.01", "0.02", "0.05"];

export function readQuickBuyPresets(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_QUICK_BUY_PRESETS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length === 4
      ? parsed
      : DEFAULT_QUICK_BUY_PRESETS;
  } catch {
    return DEFAULT_QUICK_BUY_PRESETS;
  }
}

export function writeQuickBuyPresets(next: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Best-effort — still works for this page load.
  }
}
