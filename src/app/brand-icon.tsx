import { TICKER_BRANDS, ISSUER_BRANDS, CHAIN_BRANDS } from "./brand-marks";

const FALLBACK_COLORS = ["#ff344d", "#5ae09d", "#f5a623", "#6ea8fe", "#c77dff", "#ff8a5c"];

/** Deterministic color for the plain-monogram fallback — same hash everywhere a name has no real brand mark available. */
export function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

type BrandKind = "ticker" | "issuer" | "chain";

/**
 * A real, official brand mark (see brand-marks.ts) when one exists for
 * this symbol, else a plain colored-monogram badge — never a fabricated
 * logo. Used anywhere this app shows a ticker, issuer, or chain next to
 * its identity, matching how any stock-data site or trading app labels
 * one.
 */
export function BrandIcon({ symbol, name, kind = "ticker", size = 28 }: { symbol: string; name?: string; kind?: BrandKind; size?: number }) {
  const table = kind === "ticker" ? TICKER_BRANDS : kind === "issuer" ? ISSUER_BRANDS : CHAIN_BRANDS;
  const mark = table[symbol.toLowerCase()] ?? table[symbol];
  const label = name ?? symbol;

  if (mark) {
    return (
      <span className="brand-icon-badge" style={{ width: size, height: size }} title={mark.title}>
        <svg viewBox="0 0 24 24" style={{ width: "58%", height: "58%", fill: `#${mark.hex}` }}>
          <path d={mark.path} />
        </svg>
      </span>
    );
  }

  return (
    <span
      className="brand-icon-badge brand-icon-fallback"
      style={{ width: size, height: size, background: colorForName(label), fontSize: size * 0.42 }}
      title={label}
    >
      {label.charAt(0).toUpperCase()}
    </span>
  );
}
