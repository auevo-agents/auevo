"use client";

/** Browser-local favorite pools — same pattern as auevo.watchedWallets / auevo.trackedTokens. */

const STORAGE_KEY = "auevo.favoritePools";

export function readFavorites(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeFavorites(next: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Best-effort — still works for this page load.
  }
}

export function isFavorite(poolAddress: string): boolean {
  return readFavorites().includes(poolAddress);
}

/** Toggles and returns the new list. */
export function toggleFavorite(poolAddress: string): string[] {
  const current = readFavorites();
  const next = current.includes(poolAddress)
    ? current.filter((a) => a !== poolAddress)
    : [...current, poolAddress];
  writeFavorites(next);
  return next;
}
