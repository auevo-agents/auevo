"use client";

import type { Candle } from "@/lib/geckoterminal";

/**
 * A plain SVG candlestick chart — no charting library. For one pool's
 * OHLCV series (a few hundred points at most) a hand-rolled scale is
 * simpler and lighter than pulling in a charting dependency for a single
 * chart type, and there's nothing here a library would meaningfully
 * simplify: min/max, a linear scale, and a rect per candle.
 */

const WIDTH = 900;
const HEIGHT = 320;
const PAD_TOP = 12;
const PAD_BOTTOM = 22;

export function CandlestickChart({ candles }: { candles: Candle[] }) {
  if (candles.length === 0) return null;

  const high = Math.max(...candles.map((c) => c.high));
  const low = Math.min(...candles.map((c) => c.low));
  const range = high - low || high || 1;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const slot = WIDTH / candles.length;
  const bodyWidth = Math.max(1, Math.min(9, slot * 0.6));

  function y(value: number): number {
    return PAD_TOP + (1 - (value - low) / range) * plotHeight;
  }

  const openingPrice = candles[0].open;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="token-chart-svg"
      preserveAspectRatio="none"
      role="img"
      aria-label="Price candlestick chart"
    >
      <line
        x1={0}
        x2={WIDTH}
        y1={y(openingPrice)}
        y2={y(openingPrice)}
        stroke="#1c2226"
        strokeDasharray="4 4"
      />

      {candles.map((c, i) => {
        const cx = slot * i + slot / 2;
        const up = c.close >= c.open;
        const color = up ? "#34d399" : "#ff4259";
        const bodyTop = y(Math.max(c.open, c.close));
        const bodyBottom = y(Math.min(c.open, c.close));

        return (
          <g key={c.timestamp}>
            <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth={1} />
            <rect
              x={cx - bodyWidth / 2}
              y={bodyTop}
              width={bodyWidth}
              height={Math.max(1, bodyBottom - bodyTop)}
              fill={color}
            />
          </g>
        );
      })}
    </svg>
  );
}
