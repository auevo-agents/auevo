"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ConnectButton } from "../connect-button";
import { SwapPanel } from "../swap-panel";

/**
 * Trading — the standalone swap page. The actual swap logic lives in
 * ../swap-panel.tsx, shared with the token detail page's embedded trade
 * panel; this page just supplies the header, the explainer notice, and
 * the ?tokenIn=&tokenOut= prefill from links elsewhere in the app.
 */
export default function TradingPage() {
  return (
    <Suspense fallback={null}>
      <TradingApp />
    </Suspense>
  );
}

function TradingApp() {
  const searchParams = useSearchParams();

  return (
    <>
      <header className="product-header">
        <div>
          <h3>Trading</h3>
          <p>Single-hop swap via Uniswap V3 · non-custodial</p>
        </div>
        <ConnectButton />
      </header>

      <div className="app-notice app-notice-info">
        Routed through Uniswap&apos;s own SwapRouter02 on Robinhood Chain — not
        a contract of ours. You approve and sign every step in your own wallet.
        ERC-20 pairs only for now; native-ETH swaps need a confirmed WETH
        address first.
      </div>

      <SwapPanel
        initialTokenIn={searchParams.get("tokenIn") ?? ""}
        initialTokenOut={searchParams.get("tokenOut") ?? ""}
      />
    </>
  );
}
