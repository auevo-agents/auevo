"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import Link from "next/link";

// Jupiter's own low-cost, embeddable swap widget — see developers.jup.ag.
// We charge our own platform fee (far below what Axiom/BullX/etc charge)
// via the Jupiter Referral Program instead of building/maintaining our own
// execution layer. No custody: the user connects their own wallet inside
// the widget, we never touch their keys or funds.
declare global {
  interface Window {
    Jupiter?: {
      init: (config: Record<string, unknown>) => void;
      _instance?: unknown;
    };
  }
}

const REFERRAL_ACCOUNT = process.env.NEXT_PUBLIC_JUPITER_REFERRAL_ACCOUNT;
const FEE_BPS = Number(process.env.NEXT_PUBLIC_JUPITER_FEE_BPS ?? "15"); // 15 bps = 0.15%

export default function TradePage() {
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (!scriptLoaded || !window.Jupiter) return;

    window.Jupiter.init({
      displayMode: "integrated",
      integratedTargetId: "jupiter-terminal",
      endpoint:
        process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT ??
        "https://api.mainnet-beta.solana.com",
      ...(REFERRAL_ACCOUNT
        ? {
            formProps: {
              referralAccount: REFERRAL_ACCOUNT,
              referralFee: FEE_BPS,
            },
          }
        : {}),
    });
  }, [scriptLoaded]);

  return (
    <>
      <Script
        src="https://terminal.jup.ag/main-v4.js"
        data-preload
        onLoad={() => setScriptLoaded(true)}
        strategy="afterInteractive"
      />

      <main className="trade-page">
        <header className="trade-topbar">
          <Link href="/" className="brand">
            auevo<span>_</span>
          </Link>
          <Link href="/" className="trade-back">
            ← Back to home
          </Link>
        </header>

        <div className="trade-intro">
          <span className="trade-eyebrow">TRADE CHEAPER</span>
          <h1>Same trade. A fraction of the fee.</h1>
          <p>
            {FEE_BPS / 100}% platform fee instead of the ~1% most bots
            charge. Connect your own wallet below — nothing is custodied,
            nothing changes hands but the swap itself.
          </p>
        </div>

        <div className="trade-widget-frame">
          <div id="jupiter-terminal" />
          {!scriptLoaded && (
            <p className="trade-loading">Loading swap widget…</p>
          )}
        </div>

        {!REFERRAL_ACCOUNT && (
          <p className="trade-config-warning">
            NEXT_PUBLIC_JUPITER_REFERRAL_ACCOUNT isn&apos;t set yet — the
            widget works, but fee collection is off until it&apos;s
            configured.
          </p>
        )}
      </main>
    </>
  );
}
