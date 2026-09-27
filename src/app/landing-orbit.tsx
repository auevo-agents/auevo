"use client";

import { useRef, type MouseEvent } from "react";
import { GlyphChain, GlyphEquity, GlyphEtf, GlyphIssuer, GlyphTreasury } from "./landing-glyphs";

/**
 * Hero visual — a "glass orb constellation": a dotted globe with rotating
 * orbit rings and floating glass nodes, each labeled with the real
 * concept it stands for (equities, ETFs, treasuries, issuers, chains).
 * Built from an actual reference screenshot the user sent (a photoreal
 * 3D render of a glass globe with brand-logo orbs) — this is the web-
 * native equivalent of that composition, not a pixel copy: a rendered
 * photoreal image isn't something CSS/SVG reproduces 1:1, and the
 * reference's per-orb brand logos (Apple, Tesla, a bank mark, …) are
 * real companies' trademarks this app has no license to reproduce, so
 * the orbs carry original category glyphs (landing-glyphs.tsx) instead
 * of copied logos.
 *
 * Genuinely animated, not just decorative-looking: the whole cluster
 * tilts toward the cursor (mouse-driven --tiltX/--tiltY, see globals.css),
 * two rings spin continuously at different speeds, the sphere's glow
 * pulses, and every node floats on its own staggered bob loop.
 */
function dotGrid(): { x: number; y: number; r: number }[] {
  const dots: { x: number; y: number; r: number }[] = [];
  const cx = 100;
  const cy = 100;
  const r = 68;
  const step = 8;
  for (let y = cy - r; y <= cy + r; y += step) {
    for (let x = cx - r; x <= cx + r; x += step) {
      const dx = (x - cx) / r;
      const dy = (y - cy) / r;
      if (dx * dx + dy * dy <= 1) {
        dots.push({ x, y, r: 1 });
      }
    }
  }
  return dots;
}

const DOTS = dotGrid();

const NODES = [
  { Icon: GlyphEquity, label: "Equities", top: "6%", left: "2%" },
  { Icon: GlyphEtf, label: "ETFs", top: "2%", left: "72%" },
  { Icon: GlyphTreasury, label: "Treasuries", top: "40%", left: "88%" },
  { Icon: GlyphIssuer, label: "Issuers", top: "78%", left: "68%" },
  { Icon: GlyphChain, label: "Chains", top: "72%", left: "0%" },
] as const;

export function LandingOrbit() {
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    node.style.setProperty("--tiltX", `${(-py * 10).toFixed(2)}deg`);
    node.style.setProperty("--tiltY", `${(px * 10).toFixed(2)}deg`);
  }

  function handleMouseLeave() {
    const node = ref.current;
    if (!node) return;
    node.style.setProperty("--tiltX", "0deg");
    node.style.setProperty("--tiltY", "0deg");
  }

  return (
    <div className="landing2-orbit" aria-hidden="true" ref={ref} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      <div className="landing2-orbit-tilt">
        <div className="landing2-orbit-glow" />
        <svg viewBox="0 0 200 200" fill="none" className="landing2-orbit-svg">
          <circle cx="100" cy="100" r="68" className="landing2-orbit-sphere" />
          {DOTS.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} className="landing2-orbit-dots" />
          ))}
          <ellipse className="landing2-orbit-ring landing2-orbit-ring-1" cx="100" cy="100" rx="94" ry="34" style={{ transformBox: "fill-box" }} />
          <ellipse className="landing2-orbit-ring landing2-orbit-ring-2" cx="100" cy="100" rx="34" ry="94" style={{ transformBox: "fill-box" }} />
          <ellipse className="landing2-orbit-ring landing2-orbit-ring-3" cx="100" cy="100" rx="88" ry="60" style={{ transformBox: "fill-box" }} />
        </svg>

        {NODES.map((n, i) => (
          <div className="landing2-orbit-node" key={n.label} style={{ top: n.top, left: n.left, animationDelay: `${i * 0.35}s` }}>
            <span className="landing2-orbit-node-glass">
              <n.Icon className="landing2-orbit-node-icon" />
            </span>
            <span className="landing2-orbit-node-label">{n.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
