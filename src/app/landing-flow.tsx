const NODES = [
  { label: "Issuer", tag: "Robinhood, Ondo, xStocks…" },
  { label: "Token contract", tag: "Verified on-chain" },
  { label: "v4 pool", tag: "RWA / USDG" },
  { label: "Scanner", tag: "Premium · risk · liquidity" },
  { label: "Your wallet", tag: "One signature" },
] as const;

function FlowIcon({ index }: { index: number }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths = [
    <><path d="M3 10h18M5 10V21M9 10V21M15 10V21M19 10V21M3 21h18M2 7l10-5 10 5v3H2z" /></>,
    <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v6h5M10 13h6M10 17h6" /></>,
    <><path d="M3 18h18M5 18v-4h14v4M7 14v-4h10v4M9 10V6h6v4" /></>,
    <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5M8 12l2-2 2 1 2-3" /></>,
    <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M7 16h5" /></>,
  ];
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>{paths[index]}</svg>;
}

/** A visual route diagram of the platform's existing issuer-to-wallet flow. */
export function LandingFlow() {
  return (
    <div className="landing2-flow" aria-hidden="true">
      {NODES.map((node, i) => (
        <div className="landing2-flow-item" key={node.label}>
          <div className="landing2-flow-node">
            <span className="landing2-flow-icon"><FlowIcon index={i} /></span>
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
