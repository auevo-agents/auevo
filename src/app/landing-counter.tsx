"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts up to `value` once the number scrolls into view. `value` is
 * always a real count passed down from the server (issuer/chain/tool
 * counts) — this only animates the reveal of a real number, it never
 * invents one.
 */
export function Counter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const duration = 900;
        const start = performance.now();
        function tick(now: number) {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - (1 - progress) * (1 - progress);
          setDisplay(Math.round(eased * value));
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [value]);

  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  );
}
