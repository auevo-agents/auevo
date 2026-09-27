"use client";

import { useEffect, useRef } from "react";
import { BrandIcon } from "./brand-icon";

const ASSETS = ["NVDA", "SPY", "TSLA"] as const;

export function LandingOrbit() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;

    const paint = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      const centerDelta = viewport / 2 - (rect.top + rect.height / 2);
      const scrollProgress = Math.max(-1, Math.min(1, centerDelta / viewport));

      node.style.setProperty("--tiltX", `${(-pointerY * 8).toFixed(2)}deg`);
      node.style.setProperty("--tiltY", `${(pointerX * 10).toFixed(2)}deg`);
      node.style.setProperty("--pointerX", `${((pointerX + 0.5) * 100).toFixed(1)}%`);
      node.style.setProperty("--pointerY", `${((pointerY + 0.5) * 100).toFixed(1)}%`);
      node.style.setProperty("--scrollShift", `${(scrollProgress * 22).toFixed(2)}px`);
      node.style.setProperty("--scrollScale", (1 + Math.abs(scrollProgress) * 0.018).toFixed(3));
    };

    const requestPaint = () => {
      if (!frame) frame = window.requestAnimationFrame(paint);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const rect = node.getBoundingClientRect();
      pointerX = Math.max(-0.5, Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5));
      pointerY = Math.max(-0.5, Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5));
      requestPaint();
    };

    const resetPointer = () => {
      pointerX = 0;
      pointerY = 0;
      requestPaint();
    };

    node.addEventListener("pointermove", handlePointerMove, { passive: true });
    node.addEventListener("pointerleave", resetPointer);
    window.addEventListener("scroll", requestPaint, { passive: true });
    window.addEventListener("resize", requestPaint, { passive: true });
    paint();

    return () => {
      node.removeEventListener("pointermove", handlePointerMove);
      node.removeEventListener("pointerleave", resetPointer);
      window.removeEventListener("scroll", requestPaint);
      window.removeEventListener("resize", requestPaint);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="landing2-orbit" aria-hidden="true" ref={ref}>
      <div className="landing2-orbit-stage">
        <div className="landing2-orbit-tilt">
          <div className="landing2-orbit-halo" />
          <span className="landing2-live-orbit landing2-live-orbit-1"><i /></span>
          <span className="landing2-live-orbit landing2-live-orbit-2"><i /></span>
          <span className="landing2-live-orbit landing2-live-orbit-3"><i /></span>
          <div className="landing2-orbit-image" />
          <div className="landing2-orbit-scan" />
          <div className="landing2-orbit-lens" />
          <span className="landing2-orbit-signal landing2-orbit-signal-1" />
          <span className="landing2-orbit-signal landing2-orbit-signal-2" />
          <span className="landing2-orbit-signal landing2-orbit-signal-3" />
          {ASSETS.map((symbol, i) => (
            <div className={`landing2-orbit-badge landing2-orbit-badge-${i + 1}`} key={symbol}>
              <BrandIcon symbol={symbol} kind="ticker" size={28} />
              <span>{symbol}</span>
            </div>
          ))}
        </div>
        <div className="landing2-orbit-shadow" />
      </div>
    </div>
  );
}
