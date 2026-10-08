"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BrandIcon } from "./brand-icon";
import { robinhoodChain } from "@/lib/chains";
import { shortenAddress } from "@/lib/format";

export interface PickableToken {
  ticker: string;
  name: string;
  address: string;
  decimals: number;
  priceUsd: number | null;
}

interface RawAssetToken {
  chainId: number;
  address: string;
  decimals: number;
  priceUsd: number | null;
}

interface RawAsset {
  ticker: string;
  name: string;
  primaryPriceUsd: number | null;
  tokens: RawAssetToken[];
}

let cachedAssets: RawAsset[] | null = null;
let cachedAssetsPromise: Promise<RawAsset[]> | null = null;

/**
 * The same verified rwa_tokens catalog /app/assets already reads
 * (/api/rwa/assets) — never a separate/guessed token list. Fetched once
 * (assets span every chain this app tracks, not just Robinhood Chain —
 * rwa_tokens has real rows for Ethereum, BSC, Arbitrum, HyperEVM too, the
 * other chains LI.FI's Swap/Bridge page can pick a "from"/"to" chain from)
 * and cached module-wide since every swap/trade form on a page needs the
 * same underlying list, just filtered to a different chain.
 */
function fetchRawAssets(): Promise<RawAsset[]> {
  if (cachedAssets) return Promise.resolve(cachedAssets);
  if (!cachedAssetsPromise) {
    cachedAssetsPromise = fetch("/api/rwa/assets")
      .then((r) => r.json())
      .then((data) => {
        const assets = (data.assets ?? []) as RawAsset[];
        cachedAssets = assets;
        return assets;
      })
      .catch(() => []);
  }
  return cachedAssetsPromise;
}

/** Verified tokens on the given chain, for any swap/trade form's asset picker. Defaults to Robinhood Chain — the only chain this app's own DEX/LP/bots forms trade on. */
export function usePickableTokens(chainId: number = robinhoodChain.id): PickableToken[] {
  const [assets, setAssets] = useState<RawAsset[]>(cachedAssets ?? []);
  useEffect(() => {
    let cancelled = false;
    fetchRawAssets().then((a) => {
      if (!cancelled) setAssets(a);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return useMemo(() => {
    const tokens: PickableToken[] = [];
    for (const asset of assets) {
      const onChain = asset.tokens.find((t) => t.chainId === chainId);
      if (!onChain) continue;
      tokens.push({
        ticker: asset.ticker,
        name: asset.name,
        address: onChain.address,
        decimals: onChain.decimals,
        priceUsd: onChain.priceUsd ?? asset.primaryPriceUsd,
      });
    }
    tokens.sort((a, b) => a.ticker.localeCompare(b.ticker));
    return tokens;
  }, [assets, chainId]);
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * A pill button (logo + ticker + chevron) that opens a searchable list of
 * verified xStocks tokens — the picker Aeva's own swap form uses instead of
 * a raw-address text field. A pasted contract address is still accepted
 * (this app also trades unlisted/unverified pairs), it just no longer has
 * to be the only way in.
 */
export function TokenPickerButton({
  value,
  onChange,
  tokens,
  placeholder = "Select token",
  allowCustomAddress = true,
}: {
  value: string;
  onChange: (address: string) => void;
  tokens: PickableToken[];
  placeholder?: string;
  allowCustomAddress?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => tokens.find((t) => t.address.toLowerCase() === value.trim().toLowerCase()),
    [tokens, value]
  );

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 24);
      const maxHeight = Math.min(380, window.innerHeight - 24);
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const top = below >= Math.min(350, maxHeight) || below >= above
        ? Math.min(rect.bottom + 8, window.innerHeight - maxHeight - 12)
        : Math.max(12, rect.top - maxHeight - 8);
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
      setPanelPosition({ top, left, width });
    }

    function onDocPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    updatePosition();
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tokens;
    return tokens.filter((t) => t.ticker.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
  }, [tokens, query]);

  const trimmedQuery = query.trim();
  const isCustomAddress = Boolean(value) && !selected && ADDRESS_RE.test(value.trim());

  return (
    <div className="token-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="token-picker-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
      >
        {selected ? (
          <>
            <BrandIcon symbol={selected.ticker} kind="ticker" size={22} />
            <span>{selected.ticker}</span>
          </>
        ) : isCustomAddress ? (
          <span className="token-picker-custom">{shortenAddress(value.trim())}</span>
        ) : (
          <span className="token-picker-placeholder">{placeholder}</span>
        )}
        <svg className="token-picker-chevron" viewBox="0 0 24 24" width={14} height={14} aria-hidden="true">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && panelPosition && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          className="token-picker-panel"
          style={{ top: panelPosition.top, left: panelPosition.left, width: panelPosition.width }}
        >
          <input
            autoFocus
            className="token-picker-search"
            placeholder="Search ticker, or paste a contract address…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="token-picker-list" role="listbox">
            {filtered.map((t) => (
              <button
                key={t.address}
                type="button"
                className="token-picker-row"
                role="option"
                aria-selected={t.address.toLowerCase() === value.trim().toLowerCase()}
                onClick={() => {
                  onChange(t.address);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <BrandIcon symbol={t.ticker} kind="ticker" size={26} />
                <span className="token-picker-row-info">
                  <b>{t.ticker}</b>
                  <small>{t.name}</small>
                </span>
                {t.priceUsd !== null && <span className="token-picker-row-price">${t.priceUsd.toFixed(2)}</span>}
              </button>
            ))}
            {filtered.length === 0 && allowCustomAddress && ADDRESS_RE.test(trimmedQuery) && (
              <button
                type="button"
                className="token-picker-row"
                onClick={() => {
                  onChange(trimmedQuery);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span className="token-picker-row-info">
                  <b>Use this address</b>
                  <small>{trimmedQuery}</small>
                </span>
              </button>
            )}
            {filtered.length === 0 && !ADDRESS_RE.test(trimmedQuery) && (
              <div className="token-picker-empty">
                No matching verified tokens{allowCustomAddress ? " — paste a contract address instead" : ""}.
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
