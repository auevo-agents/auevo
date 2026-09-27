export const metadata = { title: "Auevo — Private Swap (in progress)" };

/**
 * A deliberate stop point (see docs/RWA_SPEC.md section 9 and this page's
 * git history for why), not a dead link — shown as a blurred swap-window
 * mock under a plain "Coming soon" badge rather than a wall of text.
 */
export default function PrivateSwapPage() {
  return (
    <>
      <header className="product-header">
        <div>
          <h3>Private Swap</h3>
        </div>
      </header>

      <div className="private-swap-preview">
        <div className="private-swap-mock" aria-hidden="true">
          <div className="swap-card">
            <div className="swap-card-head">
              <span className="swap-card-label">You pay</span>
            </div>
            <div className="swap-card-row">
              <span className="swap-card-amount swap-card-amount-readonly">0.0</span>
              <span className="token-picker-trigger">
                <span className="token-picker-placeholder">Select token</span>
              </span>
            </div>
          </div>

          <div className="swap-card-divider">↓</div>

          <div className="swap-card">
            <div className="swap-card-head">
              <span className="swap-card-label">You receive</span>
            </div>
            <div className="swap-card-row">
              <span className="swap-card-amount swap-card-amount-readonly">0.0</span>
              <span className="token-picker-trigger">
                <span className="token-picker-placeholder">Select token</span>
              </span>
            </div>
          </div>
        </div>

        <span className="private-swap-badge">Coming soon</span>
      </div>
    </>
  );
}
