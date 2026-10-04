import Link from "next/link";
import { BrandIcon } from "@/app/brand-icon";

const ASSETS = [
  { ticker: "TSLA", name: "Tesla", issuer: "xStocks · Ethereum" },
  { ticker: "NVDA", name: "NVIDIA", issuer: "Ondo · Ethereum" },
  { ticker: "SPY", name: "S&P 500 ETF", issuer: "Backed · Arbitrum" },
  { ticker: "T-BILL", name: "U.S. Treasury Bill", issuer: "Franklin · Ethereum" },
] as const;

export function RwaMarketVisual() {
  return (
    <div className="rwa-market-visual" aria-label="Auevo tokenized markets preview">
      <div className="rwa-world" aria-hidden="true">
        <span className="rwa-world-grid" />
        <span className="rwa-world-orbit rwa-world-orbit-a" />
        <span className="rwa-world-orbit rwa-world-orbit-b" />
        <span className="rwa-world-orbit rwa-world-orbit-c" />
        <span className="rwa-world-node rwa-world-node-a" />
        <span className="rwa-world-node rwa-world-node-b" />
        <span className="rwa-world-node rwa-world-node-c" />
        <span className="rwa-world-node rwa-world-node-d" />
      </div>

      <div className="rwa-market-window">
        <div className="rwa-market-window-top">
          <div>
            <span className="rwa-market-window-brand">AUEVO</span>
            <span className="rwa-market-window-sub">Tokenized Markets</span>
          </div>
          <span className="rwa-market-window-badge">One asset · multiple issuers</span>
        </div>

        <div className="rwa-market-window-heading">
          <div>
            <span>REGISTRY</span>
            <strong>Explore assets</strong>
            <p>Compare issuers and chains before you trade.</p>
          </div>
          <span className="rwa-market-window-filter">All assets <b>⌄</b></span>
        </div>

        <div className="rwa-market-window-table">
          <div className="rwa-market-window-row rwa-market-window-head">
            <span>ASSET</span>
            <span>ISSUER · CHAIN</span>
            <span>STATUS</span>
            <span />
          </div>
          {ASSETS.map((asset) => (
            <div className="rwa-market-window-row" key={asset.ticker}>
              <span className="rwa-market-window-asset">
                <BrandIcon symbol={asset.ticker} name={asset.name} kind="ticker" size={28} />
                <span><b>{asset.ticker}</b><small>{asset.name}</small></span>
              </span>
              <span className="rwa-market-window-issuer">{asset.issuer}</span>
              <span className="rwa-market-window-status"><i /> Verified</span>
              <span className="rwa-market-window-open">Browse →</span>
            </div>
          ))}
        </div>

        <Link href="/rwa/app/assets" className="rwa-market-window-foot">
          Open verified registry <span>↗</span>
        </Link>
      </div>

      <div className="rwa-world-label">
        <span>REAL WORLD ASSETS</span>
        <b>GLOBAL ACCESS</b>
      </div>
    </div>
  );
}
