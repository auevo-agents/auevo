"use client";

import { useRef, type MouseEvent } from "react";
import { BrandIcon } from "./brand-icon";

const ASSETS = ["NVDA", "SPY", "TSLA"] as const;

export function LandingOrbit() {
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    node.style.setProperty("--tiltX", `${(-py * 4).toFixed(2)}deg`);
    node.style.setProperty("--tiltY", `${(px * 4).toFixed(2)}deg`);
  }

  function resetTilt() {
    const node = ref.current;
    if (!node) return;
    node.style.setProperty("--tiltX", "0deg");
    node.style.setProperty("--tiltY", "0deg");
  }

  return (
    <div className="landing2-orbit" aria-hidden="true" ref={ref} onMouseMove={handleMouseMove} onMouseLeave={resetTilt}>
      <div className="landing2-orbit-tilt">
        <div className="landing2-orbit-image" />
        <div className="landing2-orbit-halo" />
        {ASSETS.map((symbol, i) => (
          <div className={`landing2-orbit-badge landing2-orbit-badge-${i + 1}`} key={symbol}>
            <BrandIcon symbol={symbol} kind="ticker" size={28} />
            <span>{symbol}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
