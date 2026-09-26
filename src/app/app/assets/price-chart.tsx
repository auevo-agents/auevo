"use client";

import { useEffect, useRef } from "react";
import { LineSeries, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";

/**
 * The token's own price against its real-world reference price —
 * RWA_SPEC.md Phase 3's "график токена поверх графика реальной акции".
 * Two line series on one chart rather than one blended line: they're two
 * genuinely different things (an on-chain trading price vs. the real
 * asset's price), and overlaying them is what actually shows a
 * premium/discount opening up over time.
 */

export interface PricePoint {
  ts: string;
  priceUsd: number | null;
  referencePriceUsd: number | null;
}

export function PriceChart({ points }: { points: PricePoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const priceSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const referenceSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart: IChartApi = createChart(container, {
      width: container.clientWidth,
      height: 300,
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

    priceSeriesRef.current = chart.addSeries(LineSeries, {
      color: "#ff4259",
      lineWidth: 2,
      title: "Token",
    });
    referenceSeriesRef.current = chart.addSeries(LineSeries, {
      color: "#5a6469",
      lineWidth: 1,
      lineStyle: 2, // dashed — visually secondary to the token's own line
      title: "Reference",
    });

    const resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) chart.applyOptions({ width });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      priceSeriesRef.current = null;
      referenceSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const priceSeries = priceSeriesRef.current;
    const referenceSeries = referenceSeriesRef.current;
    if (!priceSeries || !referenceSeries) return;

    const priceData = points
      .filter((p): p is PricePoint & { priceUsd: number } => p.priceUsd !== null)
      .map((p) => ({ time: (Date.parse(p.ts) / 1000) as UTCTimestamp, value: p.priceUsd }));
    const referenceData = points
      .filter((p): p is PricePoint & { referencePriceUsd: number } => p.referencePriceUsd !== null)
      .map((p) => ({ time: (Date.parse(p.ts) / 1000) as UTCTimestamp, value: p.referencePriceUsd }));

    priceSeries.setData(priceData);
    referenceSeries.setData(referenceData);
  }, [points]);

  return <div ref={containerRef} className="token-chart-container" />;
}
