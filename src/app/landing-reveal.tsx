"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fades + slides a section in the first time it scrolls into view.
 * IntersectionObserver rather than a scroll listener — cheaper, and it
 * naturally handles "already visible on load" (the hero) the same way
 * as "scrolled to later". Static (server-rendered) content everywhere
 * else on this page stays server-rendered; this is the one bit of
 * client JS the "premium" scroll motion actually needs.
 */
export function Reveal({ children, delayMs = 0 }: { children: ReactNode; delayMs?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={visible ? "landing2-reveal landing2-reveal-visible" : "landing2-reveal"} style={{ transitionDelay: `${delayMs}ms` }}>
      {children}
    </div>
  );
}
