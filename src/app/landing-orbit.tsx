import Link from "next/link";
import { BrandIcon } from "./brand-icon";

/** A product preview in the hero. Its rows are examples, not live quotes. */
export function LandingOrbit() {
  return (
    <div className="hybrid-hero-visual">
      <div className="hybrid-preview" aria-label="Preview of the Auevo asset explorer">
        <div className="hybrid-preview-top">
          <span className="hybrid-preview-brand"><span className="hybrid-preview-mark">A</span> AUEVO <small>/ Markets</small></span>
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
        <Link className="hybrid-preview-bottom" href="/app/assets">Explore the registry <span aria-hidden="true">↗</span></Link>
      </div>
      <span className="hybrid-float-tag hybrid-float-tag-top">One asset · multiple issuers</span>
      <span className="hybrid-float-tag hybrid-float-tag-bottom">Verified on-chain data</span>
    </div>
  );
}
