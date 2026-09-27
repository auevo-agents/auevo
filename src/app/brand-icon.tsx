import { TICKER_BRANDS, ISSUER_BRANDS, CHAIN_BRANDS, ISSUER_MONOGRAM_COLORS } from "./brand-marks";
import { TICKER_LOGO_FILES, ISSUER_LOGO_FILES, CHAIN_LOGO_FILES } from "./brand-logo-files";

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
  const fileTable = kind === "ticker" ? TICKER_LOGO_FILES : kind === "issuer" ? ISSUER_LOGO_FILES : CHAIN_LOGO_FILES;
  const mark = table[symbol.toLowerCase()] ?? table[symbol];
  const file = fileTable[symbol.toLowerCase()] ?? fileTable[symbol];
  const label = name ?? symbol;

  // A user-supplied logo file (public/logos/) is checked first — real,
  // full-fidelity art beats the inline-path fallback below when both exist.
  // Fill the circular frame edge-to-edge. Several uploaded marks are square
  // app-icon tiles; clipping the image itself to the badge turns those tiles
  // into intentional round marks instead of a square floating inside a circle.
  if (file) {
    return (
      <span className="brand-icon-badge" style={{ width: size, height: size }} title={label}>
        <img src={`/logos/${file}`} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block" }} />
      </span>
    );
  }

  if (mark) {
    return (
      <span className="brand-icon-badge" style={{ width: size, height: size }} title={mark.title}>
        <svg viewBox="0 0 24 24" style={{ width: "58%", height: "58%", fill: `#${mark.hex}` }}>
          <path d={mark.path} />
        </svg>
      </span>
    );
  }

  const monogramColor = (kind === "issuer" && ISSUER_MONOGRAM_COLORS[symbol.toLowerCase()]) || colorForName(label);

  return (
    <span
      className="brand-icon-badge brand-icon-fallback"
      style={{ width: size, height: size, background: monogramColor, fontSize: size * 0.42 }}
      title={label}
    >
      {label.charAt(0).toUpperCase()}
    </span>
  );
}
