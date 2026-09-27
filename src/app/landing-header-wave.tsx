"use client";

import { useEffect, useRef } from "react";

export function LandingHeaderWave() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const surface = ref.current;
    const header = surface?.parentElement;
    if (!surface || !header) return;

    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!canHover.matches || reducedMotion.matches) return;

    const ripples = Array.from(surface.querySelectorAll<HTMLElement>(".landing-header-ripple"));
    let frame = 0;
    let rippleIndex = 0;
    let lastRipple = 0;
    let x = 0;
    let y = 0;

    const paint = () => {
      frame = 0;
      surface.style.setProperty("--wave-x", `${x}px`);
      surface.style.setProperty("--wave-y", `${y}px`);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rect = header.getBoundingClientRect();
      x = event.clientX - rect.left;
      y = event.clientY - rect.top;
      surface.classList.add("is-active");

      if (!frame) frame = window.requestAnimationFrame(paint);

      const now = performance.now();
      if (now - lastRipple < 115 || ripples.length === 0) return;
      lastRipple = now;

      const ripple = ripples[rippleIndex % ripples.length];
      rippleIndex += 1;
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      ripple.classList.remove("is-running");
      void ripple.offsetWidth;
      ripple.classList.add("is-running");
    };

    const handlePointerLeave = () => {
      surface.classList.remove("is-active");
    };

    header.addEventListener("pointermove", handlePointerMove, { passive: true });
    header.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      header.removeEventListener("pointermove", handlePointerMove);
      header.removeEventListener("pointerleave", handlePointerLeave);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="landing-header-wave" aria-hidden="true" ref={ref}>
      <span className="landing-header-wave-glow" />
      <span className="landing-header-ripple" />
      <span className="landing-header-ripple" />
      <span className="landing-header-ripple" />
      <span className="landing-header-ripple" />
    </div>
  );
}
