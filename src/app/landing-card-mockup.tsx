import { BrandIcon } from "./brand-icon";

export type MockupKind = "chips" | "compare" | "checklist" | "apr" | "alert";

/**
 * Small "show it working" previews embedded in each feature card, the
 * same move HyperDex's own cards make instead of a paragraph alone.
 * `chips` is the only one backed by real data (tickers this app's
 * registry has actually verified, passed down from the server); the
 * rest are illustrative product chrome — a route comparison, a bridge
 * status checklist, an APR row, an alert toast — not a claim about a
 * specific live number.
 */
export function CardMockup({ kind, tickers }: { kind: MockupKind; tickers?: string[] }) {
  if (kind === "chips") {
    const shown = tickers && tickers.length > 0 ? tickers.slice(0, 6) : ["NVDA", "TSLA", "SPY", "QQQ"];
    return (
      <div className="landing2-mockup">
        <div className="landing2-mockup-chips">
          {shown.map((t) => (
            <span className="landing2-mockup-chip" key={t}>
              <BrandIcon symbol={t} kind="ticker" size={14} />
              {t}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (kind === "compare") {
    return (
      <div className="landing2-mockup">
        <div className="landing2-mockup-rows">
          <div className="landing2-mockup-row">
            <span>Issuer A</span>
            <span>+1.8%</span>
          </div>
          <div className="landing2-mockup-row landing2-mockup-row-best">
            <span>Issuer B</span>
            <b>Best price</b>
          </div>
          <div className="landing2-mockup-row">
            <span>Issuer C</span>
            <span>−0.4%</span>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "checklist") {
    return (
      <div className="landing2-mockup">
        <div className="landing2-mockup-check">
          <span className="landing2-mockup-check-icon">✓</span>
          One wallet signature
        </div>
        <div className="landing2-mockup-check">
          <span className="landing2-mockup-check-icon">✓</span>
          Route split across legs
        </div>
        <div className="landing2-mockup-check">
          <span className="landing2-mockup-check-icon">✓</span>
          Confirmed on-chain
        </div>
      </div>
    );
  }

  if (kind === "apr") {
    return (
      <div className="landing2-mockup">
        <div className="landing2-mockup-rows">
          <div className="landing2-mockup-row">
            <span>SPY / USDG</span>
            <span>Uniswap v4</span>
          </div>
          <div className="landing2-mockup-row">
            <span>NVDA / USDG</span>
            <span>Uniswap v4</span>
          </div>
          <div className="landing2-mockup-row">
            <span>TSLA / USDG</span>
            <span>Uniswap v4</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="landing2-mockup">
      <div className="landing2-mockup-row landing2-mockup-row-best">
        <span>
          <b>Premium alert</b> · NVDA
        </span>
        <span>Telegram</span>
      </div>
      <div className="landing2-mockup-check" style={{ marginTop: 10 }}>
        <span className="landing2-mockup-check-icon">✓</span>
        Delivered to web + bot
      </div>
    </div>
  );
}
