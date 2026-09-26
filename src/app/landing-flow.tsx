const NODES = [
  { label: "Issuer", tag: "Robinhood, Ondo, xStocks…" },
  { label: "Token contract", tag: "Verified on-chain" },
  { label: "v4 pool", tag: "RWA / USDG" },
  { label: "Scanner", tag: "Premium · risk · liquidity" },
  { label: "Your wallet", tag: "One signature" },
] as const;

/**
 * A decorative pipeline diagram of the platform's real architecture
 * (issuer → token → pool → scanner → wallet) — no data is charted here,
 * just the shape of the system, with a pulse that visibly travels the
 * chain left to right (pure CSS, staggered animation-delay per segment)
 * to read as "live" rather than a static diagram.
 */
export function LandingFlow() {
  return (
    <div className="landing2-flow" aria-hidden="true">
      {NODES.map((node, i) => (
        <div className="landing2-flow-item" key={node.label}>
          <div className="landing2-flow-node">
            <span className="landing2-flow-node-dot" />
            <span className="landing2-flow-node-label">{node.label}</span>
            <span className="landing2-flow-node-tag">{node.tag}</span>
          </div>
          {i < NODES.length - 1 && (
            <div className="landing2-flow-line">
              <span className="landing2-flow-pulse" style={{ animationDelay: `${i * 0.5}s` }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
