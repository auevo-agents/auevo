"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { formatPrice } from "@/lib/format";

/**
 * The token's own price against its real-world reference price —
 * RWA_SPEC.md Phase 3's "график токена поверх графика реальной акции".
 * Real Japanese candlesticks (same lightweight-charts setup already
 * proven on /app/market/t/[address]'s CandlestickChart, matched here for
 * a consistent look) rather than a bare line: `rwa_prices` only ever
 * stores one point-in-time snapshot per cron pass, not real per-trade
 * OHLC, so each candle is built by bucketing the real snapshots that fall
 * in its time window (open = first, close = last, high/low = the actual
 * min/max seen) — honest aggregation of real values, never invented ticks.
 * A bucket with only one snapshot is a flat doji, same as any real feed
 * shows for a quiet period.
 */

export interface PricePoint {
  ts: string;
  priceUsd: number | null;
  referencePriceUsd: number | null;
}

interface Candle {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

const TARGET_CANDLES = 80;
const MIN_BUCKET_MS = 5 * 60 * 1000;

export function bucketCandles(points: PricePoint[], key: "priceUsd" | "referencePriceUsd"): Candle[] {
  const valid = points
    .filter((p): p is PricePoint & { [K in typeof key]: number } => p[key] !== null)
    .map((p) => ({ t: Date.parse(p.ts), v: p[key] as number }))
    .sort((a, b) => a.t - b.t);
  if (valid.length === 0) return [];

  const span = Math.max(valid[valid.length - 1].t - valid[0].t, 60_000);
  const bucketMs = Math.max(MIN_BUCKET_MS, Math.round(span / TARGET_CANDLES));

  const buckets = new Map<number, number[]>();
  for (const { t, v } of valid) {
    const bucketStart = Math.floor(t / bucketMs) * bucketMs;
    const arr = buckets.get(bucketStart) ?? [];
    arr.push(v);
    buckets.set(bucketStart, arr);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, values]) => ({
      time: (time / 1000) as UTCTimestamp,
      open: values[0],
      high: Math.max(...values),
      low: Math.min(...values),
      close: values[values.length - 1],
    }));
}

const RANGES: { label: string; ms: number }[] = [
  { label: "1D", ms: 24 * 60 * 60 * 1000 },
  { label: "1W", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "1M", ms: 30 * 24 * 60 * 60 * 1000 },
  { label: "3M", ms: 90 * 24 * 60 * 60 * 1000 },
];

export function PriceChart({ points }: { points: PricePoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const referenceSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [hover, setHover] = useState<Candle | null>(null);

  const candles = useMemo(() => bucketCandles(points, "priceUsd"), [points]);
  const referenceLine = useMemo(
    () => bucketCandles(points, "referencePriceUsd").map((c) => ({ time: c.time, value: c.close })),
    [points]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart: IChartApi = createChart(container, {
      width: container.clientWidth,
      height: 320,
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
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      // Same muted up/down tones the rest of the app actually renders for
      // gains/losses (globals.css's .desk-change-pos/.desk-change-neg) —
      // not lightweight-charts' own bright default green/red, which read
      // as a generic TradingView widget rather than this site's own look.
      upColor: "#88b59a",
      downColor: "#d78b82",
      borderVisible: false,
      wickUpColor: "#88b59a",
      wickDownColor: "#d78b82",
    });
    candleSeriesRef.current = candleSeries;

    const referenceSeries = chart.addSeries(LineSeries, {
      color: "#c9b27c",
      lineWidth: 1,
      lineStyle: 2, // dashed — the real-world reference, secondary to the token's own candles
      title: "Reference",
    });
    referenceSeriesRef.current = referenceSeries;

    chart.subscribeCrosshairMove((param) => {
      const point = param.seriesData?.get(candleSeries);
      if (point && "open" in point) {
        setHover(point as Candle);
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
      chartRef.current = null;
      candleSeriesRef.current = null;
      referenceSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    candleSeriesRef.current?.setData(candles);
    referenceSeriesRef.current?.setData(referenceLine);
    chartRef.current?.timeScale().fitContent();
  }, [candles, referenceLine]);

  function selectRange(ms: number) {
    const chart = chartRef.current;
    if (!chart || candles.length === 0) return;
    const lastTime = candles[candles.length - 1].time as number;
    chart.timeScale().setVisibleRange({
      from: (lastTime - ms / 1000) as UTCTimestamp,
      to: lastTime as UTCTimestamp,
    });
  }

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
      {candles.length > 0 && (
        <div className="token-chart-ranges">
          {RANGES.map((r) => (
            <button key={r.label} type="button" onClick={() => selectRange(r.ms)}>
              {r.label}
            </button>
          ))}
          <button type="button" onClick={() => chartRef.current?.timeScale().fitContent()}>
            ALL
          </button>
        </div>
      )}
      <div ref={containerRef} className="token-chart-container" />
      {candles.length === 0 && <div className="token-chart-empty">Not enough price history yet.</div>}
    </div>
  );
}
