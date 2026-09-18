"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import Link from "next/link";

// Jupiter's own low-cost, embeddable swap widget — see developers.jup.ag.
// We charge our own platform fee (far below what Axiom/BullX/etc charge)
// via the Jupiter Referral Program instead of building/maintaining our own
// execution layer. No custody: the user connects their own wallet inside
// the widget, we never touch their keys or funds.
//
// Re-skinned to Auevo's own name/logo/colors via Jupiter's officially
// documented `branding` prop and `--jupiter-terminal-*` CSS variables
// (dev.jup.ag/docs/tool-kits/terminal/customization) — this is a
// supported white-label feature, not a hack, and doesn't touch anything
// Jupiter requires to stay visible (their program is still what actually
// executes the swap on-chain regardless of what the UI is labeled).
declare global {
  interface Window {
    Jupiter?: {
      init: (config: Record<string, unknown>) => void;
      _instance?: unknown;
    };
  }
}

const REFERRAL_ACCOUNT =
  process.env.NEXT_PUBLIC_JUPITER_REFERRAL_ACCOUNT ??
  "CwczUtJgizVz8bKyKYVUkYbVDMpDudeQ6PLcKyd4PeRv";
const FEE_BPS = Number(process.env.NEXT_PUBLIC_JUPITER_FEE_BPS ?? "50"); // 50 bps = 0.5% — Jupiter's documented minimum for referralFee is 50; anything lower is rejected at swap time

export default function TradePage() {
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (!scriptLoaded || !window.Jupiter) return;

    window.Jupiter.init({
      displayMode: "integrated",
      integratedTargetId: "jupiter-terminal",
      containerStyles: {
        width: "100%",
        borderRadius: "12px",
        overflow: "hidden",
      },
      branding: {
        name: "Auevo",
        logoUri: "https://auevo.io/icon.png",
      },
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
      </main>
    </>
  );
}
