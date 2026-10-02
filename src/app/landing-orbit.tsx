"use client";

import Link from "next/link";
import { useRef, type PointerEvent } from "react";
import { BrandIcon } from "./brand-icon";
import { AuevoLogo } from "./auevo-logo";

/** A product preview in the hero. Its rows are examples, not live quotes. */
export function LandingOrbit() {
  const visualRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const visual = visualRef.current;
    if (!visual) return;
    const bounds = visual.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      visual.style.setProperty("--preview-x", `${(x * 13).toFixed(2)}deg`);
      visual.style.setProperty("--preview-y", `${(-y * 11).toFixed(2)}deg`);
      visual.style.setProperty("--preview-glow-x", `${((x + 0.5) * 100).toFixed(1)}%`);
      visual.style.setProperty("--preview-glow-y", `${((y + 0.5) * 100).toFixed(1)}%`);
    });
  }

  function onPointerLeave() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    visualRef.current?.style.removeProperty("--preview-x");
    visualRef.current?.style.removeProperty("--preview-y");
    visualRef.current?.style.removeProperty("--preview-glow-x");
    visualRef.current?.style.removeProperty("--preview-glow-y");
  }

  return (
    <div className="hybrid-hero-visual" ref={visualRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <div className="hybrid-preview" aria-label="Preview of the Auevo asset explorer">
        <div className="hybrid-preview-top">
          <span className="hybrid-preview-brand"><AuevoLogo /> <small>/ Markets</small></span>
          <span className="hybrid-preview-status"><i /> Registry overview</span>
        </div>
        <div className="hybrid-preview-heading">
          <div>
            <span className="hybrid-preview-kicker">TOKENIZED MARKETS</span>
            <strong>Explore assets</strong>
            <p>Compare issuers and chains before you trade.</p>
          </div>
          <span className="hybrid-preview-filter">All assets <span>⌄</span></span>
        </div>
        <div className="hybrid-preview-table">
          <div className="hybrid-preview-row hybrid-preview-th"><span>ASSET</span><span>COMPARE</span><span>STATUS</span></div>
          {[
            { ticker: "TSLA", name: "Tesla" },
            { ticker: "NVDA", name: "NVIDIA" },
            { ticker: "SPY", name: "S&P 500 ETF" },
          ].map((item) => (
            <div className="hybrid-preview-row" key={item.ticker}>
              <span className="hybrid-preview-asset"><BrandIcon symbol={item.ticker} kind="ticker" size={30} /><span><b>{item.ticker}</b><small>{item.name}</small></span></span>
              <span className="hybrid-preview-compare">Issuer · chain</span>
              <span className="hybrid-preview-listed"><i /> Browse</span>
            </div>
          ))}
        </div>
        <Link className="hybrid-preview-bottom" href="/rwa/app/assets">Explore the registry <span aria-hidden="true">↗</span></Link>
      </div>
      <span className="hybrid-float-tag hybrid-float-tag-top">One asset · multiple issuers</span>
      <span className="hybrid-float-tag hybrid-float-tag-bottom">Verified on-chain data</span>
    </div>
  );
}
