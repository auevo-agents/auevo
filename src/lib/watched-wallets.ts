"use client";

/**
 * Browser-local wallet watchlist — same pattern as favorites.ts /
 * quick-buy-presets.ts. Stores a label alongside each address (DeBank,
 * Nansen etc. all let a followed wallet carry a name — an address alone
 * is what this was before, and told you nothing).
 */

const STORAGE_KEY = "auevo.watchedWallets";

export interface WatchedWallet {
  address: string;
  label: string | null;
}

/** Old data was a bare string[]; read it as unlabeled entries rather than losing it. */
function normalize(raw: unknown): WatchedWallet[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) =>
    typeof entry === "string"
      ? { address: entry, label: null }
      : { address: String(entry.address), label: entry.label ?? null }
  );
}

export function readWatchedWallets(): WatchedWallet[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function writeWatchedWallets(next: WatchedWallet[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Best-effort only — the click still gives visual feedback either way.
  }
}

export function isWatched(address: string): boolean {
  return readWatchedWallets().some((w) => w.address.toLowerCase() === address.toLowerCase());
}

/** Adds the address if it isn't already watched. Returns the new list. */
export function watchWallet(address: string, label?: string): WatchedWallet[] {
  const current = readWatchedWallets();
  if (current.some((w) => w.address.toLowerCase() === address.toLowerCase())) return current;
  const next = [...current, { address, label: label?.trim() || null }];
  writeWatchedWallets(next);
  return next;
}

export function unwatchWallet(address: string): WatchedWallet[] {
  const next = readWatchedWallets().filter((w) => w.address.toLowerCase() !== address.toLowerCase());
  writeWatchedWallets(next);
  return next;
}

/** Sets (or clears, with an empty string) the label for an already-watched address. */
export function setWalletLabel(address: string, label: string): WatchedWallet[] {
  const next = readWatchedWallets().map((w) =>
    w.address.toLowerCase() === address.toLowerCase() ? { ...w, label: label.trim() || null } : w
  );
  writeWatchedWallets(next);
  return next;
}
