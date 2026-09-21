"use client";

/** Browser-local wallet watchlist — same pattern as favorites.ts / quick-buy-presets.ts. */

const STORAGE_KEY = "auevo.watchedWallets";

export function readWatchedWallets(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function watchWallet(address: string) {
  try {
    const current = readWatchedWallets();
    if (!current.includes(address)) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, address]));
    }
  } catch {
    // Best-effort only — the click still gives visual feedback either way.
  }
}
