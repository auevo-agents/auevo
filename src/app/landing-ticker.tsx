interface TickerRow {
  ticker: string;
  priceUsd: number | null;
  premiumBps: number;
}

function formatUsd(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TickerContent({ rows }: { rows: TickerRow[] }) {
  return (
    <>
      {rows.map((r, i) => {
        const pct = r.premiumBps / 100;
        const sign = pct >= 0 ? "+" : "";
        return (
          <span className="landing2-ticker-item" key={`${r.ticker}-${i}`}>
            <b>{r.ticker}</b>
            <span>{formatUsd(r.priceUsd)}</span>
            <span className={pct >= 0 ? "landing2-ticker-up" : "landing2-ticker-down"}>
              {sign}
              {pct.toFixed(2)}%
            </span>
            <span className="landing2-ticker-dot">·</span>
          </span>
        );
      })}
    </>
  );
}

/**
 * A scrolling premium/discount ticker — trident3x's own top status bar,
 * pointed at real data (this app's live premium scanner, RWA_SPEC.md
 * Phase 5) instead of a single token's own quote. Duplicated once so the
 * CSS keyframe (translateX(-50%), globals.css's landing2-scroll) loops
 * seamlessly; pure CSS animation, no JS needed to run it.
 */
export function LandingTicker({ rows }: { rows: TickerRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="landing2-ticker">
      <div className="landing2-ticker-track">
        <TickerContent rows={rows} />
        <TickerContent rows={rows} />
      </div>
    </div>
  );
}
