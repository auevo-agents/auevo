"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/geckoterminal";
import { formatPrice } from "@/lib/format";

/**
 * A real interactive chart — TradingView's own lightweight-charts
 * (MIT-licensed, the same library most DEX terminals build on), not a
 * static hand-drawn SVG. Pan, zoom and a crosshair with an OHLC readout
 * come for free from the library; this component's job is just feeding
 * it data and matching the site's dark theme.
 */

interface Ohlc {
  open: number;
  high: number;
  low: number;
  close: number;
}

export function CandlestickChart({ candles }: { candles: Candle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [hover, setHover] = useState<Ohlc | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart: IChartApi = createChart(container, {
      width: container.clientWidth,
      height: 340,
      layout: {
        background: { color: "transparent" },
        textColor: "#7c8589",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#161b1e" },
        horzLines: { color: "#161b1e" },
      },
      rightPriceScale: { borderColor: "#1c2226" },
      timeScale: { borderColor: "#1c2226", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#34d399",
      downColor: "#ff4259",
      borderVisible: false,
      wickUpColor: "#34d399",
      wickDownColor: "#ff4259",
    });
    seriesRef.current = series;

    chart.subscribeCrosshairMove((param) => {
      const point = param.seriesData?.get(series);
      if (point && "open" in point) {
        setHover({ open: point.open, high: point.high, low: point.low, close: point.close });
      } else {
        setHover(null);
      }
    });

    const resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) chart.applyOptions({ width });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    series.setData(
      candles.map((c) => ({
        time: c.timestamp as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
  }, [candles]);

  const legend = hover ?? (candles.length > 0 ? candles[candles.length - 1] : null);

  return (
    <div style={{ position: "relative" }}>
      {legend && (
        <div className="token-chart-legend">
          <span>
            O <b>{formatPrice(legend.open)}</b>
          </span>
          <span>
            H <b>{formatPrice(legend.high)}</b>
          </span>
          <span>
            L <b>{formatPrice(legend.low)}</b>
          </span>
          <span>
            C <b>{formatPrice(legend.close)}</b>
          </span>
        </div>
      )}
      <div ref={containerRef} className="token-chart-container" />
    </div>
  );
}
