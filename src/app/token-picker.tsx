"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

let cachedTokens: PickableToken[] | null = null;
let cachedTokensPromise: Promise<PickableToken[]> | null = null;

/**
 * The same verified rwa_tokens catalog /app/assets already reads
 * (/api/rwa/assets), filtered to this chain and reshaped for a picker —
 * never a separate/guessed token list. Cached module-wide since every
 * swap/trade form on a page needs the same list.
 */
function fetchPickableTokens(): Promise<PickableToken[]> {
  if (cachedTokens) return Promise.resolve(cachedTokens);
  if (!cachedTokensPromise) {
    cachedTokensPromise = fetch("/api/rwa/assets")
      .then((r) => r.json())
      .then((data) => {
        const assets = (data.assets ?? []) as RawAsset[];
        const tokens: PickableToken[] = [];
        for (const asset of assets) {
          const onChain = asset.tokens.find((t) => t.chainId === robinhoodChain.id);
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
        cachedTokens = tokens;
        return tokens;
      })
      .catch(() => []);
  }
  return cachedTokensPromise;
}

/** Verified xStocks tokens on Robinhood Chain, for any swap/trade form's asset picker. */
export function usePickableTokens(): PickableToken[] {
  const [tokens, setTokens] = useState<PickableToken[]>(cachedTokens ?? []);
  useEffect(() => {
    let cancelled = false;
    fetchPickableTokens().then((t) => {
      if (!cancelled) setTokens(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return tokens;
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
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => tokens.find((t) => t.address.toLowerCase() === value.trim().toLowerCase()),
    [tokens, value]
  );

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
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
      <button type="button" className="token-picker-trigger" onClick={() => setOpen((o) => !o)}>
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

      {open && (
        <div className="token-picker-panel">
          <input
            autoFocus
            className="token-picker-search"
            placeholder="Search ticker, or paste a contract address…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="token-picker-list">
            {filtered.map((t) => (
              <button
                key={t.address}
                type="button"
                className="token-picker-row"
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
                No matching xStocks tickers{allowCustomAddress ? " — paste a contract address instead" : ""}.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
