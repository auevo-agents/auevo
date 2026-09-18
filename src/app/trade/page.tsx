"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import Link from "next/link";

// Jupiter Plugin (developers.jup.ag) — the actively maintained successor to
// the now-deprecated Jupiter Terminal. Same underlying idea: a free,
// embeddable swap widget, powered by Jupiter's own Ultra routing/MEV
// protection, that lets us set our own platform fee (far below what
// Axiom/BullX/etc charge) via the Jupiter Referral Program instead of
// building/maintaining our own execution layer. No custody: the user
// connects their own wallet inside the widget, we never touch their keys
// or funds.
//
// Re-skinned to Auevo's own name/logo/colors via Jupiter's officially
// documented `branding` prop and `--jupiter-plugin-*` CSS variables
// (developers.jup.ag/docs/tool-kits/plugin/customization) — a supported
// white-label feature, not a hack. There is no documented option to
// remove the "Powered by Jupiter" attribution line specifically (checked
// both Terminal's and Plugin's docs) — it appears to be a fixed condition
// of using the widget for free, not an oversight. Hiding it via
// undocumented CSS targeting of their internal DOM would be fragile
// (breaks on their next release) and wouldn't change what's on-chain
// anyway: the swap still executes through Jupiter's program regardless of
// what the UI says, visible to anyone who checks the transaction.
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
  "76zSkZWyH9di7V5d7cfp5aU8es3XCR6KrQRwDDEEJufV"; // Ultra referral account — Plugin runs on Ultra, which uses a separate referral registration from the old Swap+Trigger one
const FEE_BPS = Number(process.env.NEXT_PUBLIC_JUPITER_FEE_BPS ?? "50"); // 50 bps = 0.5% — Jupiter's documented minimum for referralFee is 50; anything lower is rejected at swap time

export default function TradePage() {
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (!scriptLoaded || !window.Jupiter) return;

    window.Jupiter.init({
      displayMode: "integrated",
      integratedTargetId: "jupiter-plugin",
      containerStyles: {
        width: "100%",
        borderRadius: "12px",
        overflow: "hidden",
      },
      branding: {
        name: "Auevo",
        logoUri: "https://auevo.io/icon.png",
      },
      formProps: {
        referralAccount: REFERRAL_ACCOUNT,
        referralFee: FEE_BPS,
      },
    });
  }, [scriptLoaded]);

  return (
    <>
      <Script
        src="https://plugin.jup.ag/plugin-v1.js"
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
          <div id="jupiter-plugin" />
          {!scriptLoaded && (
            <p className="trade-loading">Loading swap widget…</p>
          )}
        </div>
      </main>
    </>
  );
}
