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
// white-label feature. There is no documented option to remove the
// "Powered by Jupiter" attribution line, and no documented way to
// recolor Jupiter's own internal Swap button (it renders inside their
// shadow DOM) — both would require reaching into undocumented internal
// markup, which is fragile (breaks on their updates) and, for the
// attribution specifically, not something this codebase does — see
// git history for why. Swap success/error feedback below uses Jupiter's
// official onSuccess/onSwapError callbacks and is shown as a border/glow
// on our own container, not a recolor of their button.
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

type SwapState = "idle" | "success" | "error";

export default function TradePage() {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [swapState, setSwapState] = useState<SwapState>("idle");

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
      onSuccess: () => setSwapState("success"),
      onSwapError: () => setSwapState("error"),
      onFormUpdate: () => setSwapState("idle"),
    });
  }, [scriptLoaded]);

  // Jupiter's widget defaults to a narrow max-width (360-384px) meant for
  // a small popup/sidebar use case. We want it to fill our own container
  // instead. No documented containerStyles/containerClassName option
  // reaches inside their shadow DOM for this, so this specifically widens
  // the widget — nothing here touches colors, text, or the Jupiter
  // attribution line.
  useEffect(() => {
    if (!scriptLoaded) return;

    const widenWidget = () => {
      const root = document.getElementById("jupiter-plugin");
      if (!root) return false;

      for (const host of [root, ...Array.from(root.querySelectorAll("*"))]) {
        const shadow = (host as HTMLElement).shadowRoot;
        if (!shadow) continue;

        if (!shadow.getElementById("auevo-jupiter-width-override")) {
          const style = document.createElement("style");
          style.id = "auevo-jupiter-width-override";
          style.textContent = `
            .max-w-\\[360px\\],
            .max-w-\\[384px\\] {
              width: 100% !important;
              max-width: 100% !important;
            }
            #portal-container {
              width: 100% !important;
              max-width: none !important;
            }
          `;
          shadow.appendChild(style);
        }
        return true;
      }
      return false;
    };

    widenWidget();
    const observer = new MutationObserver(() => widenWidget());
    const root = document.getElementById("jupiter-plugin");
    if (root) observer.observe(root, { childList: true, subtree: true });

    const timer = window.setInterval(() => {
      if (widenWidget()) window.clearInterval(timer);
    }, 250);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [scriptLoaded]);

  return (
    <>
      <Script
        src="https://plugin.jup.ag/plugin-v1.js"
        data-preload
        onLoad={() => setScriptLoaded(true)}
        strategy="afterInteractive"
      />

      <main className="trade-page trade-page-v2">
        <header className="topbar">
          <Link href="/" className="brand">
            auevo<span>_</span>
          </Link>

          <nav>
            <Link href="/">Home</Link>
            <Link href="/legacy/fees">Fee scanner</Link>
            <Link href="/legacy/fees#bots">Bots</Link>
            <Link href="/legacy/fees#docs">Docs</Link>
            <Link href="/scanner">Token scanner</Link>
            <span className="trade-nav-active">Trade</span>
          </nav>

          <div className="topbar-right">
            <span className="network-dot" />
            <span>Solana</span>
          </div>
        </header>

        <section className="trade-shell">
          <div className="trade-hero">
            <div className="trade-hero-glow" />
            <div className="trade-orbit trade-orbit-one" />
            <div className="trade-orbit trade-orbit-two" />

            <div className="trade-hero-content">
              <span className="trade-eyebrow">TRADE ON AUEVO</span>

              <h1>
                Same swap.
                <strong>Keep more.</strong>
              </h1>

              <p className="trade-lead">
                Trade any token on Solana with a {FEE_BPS / 100}% platform fee
                instead of the ~1% most bots charge. Same market. Less fee.
                More stays with you.
              </p>

              <div className="trade-benefits">
                <div className="trade-benefit">
                  <span className="trade-benefit-icon">↯</span>
                  <div>
                    <strong>{FEE_BPS / 100}%</strong>
                    <small>Platform fee</small>
                  </div>
                </div>

                <div className="trade-benefit">
                  <span className="trade-benefit-icon">◇</span>
                  <div>
                    <strong>MEV</strong>
                    <small>Protection</small>
                  </div>
                </div>

                <div className="trade-benefit">
                  <span className="trade-benefit-icon">▣</span>
                  <div>
                    <strong>Non-custodial</strong>
                    <small>Your keys, your funds</small>
                  </div>
                </div>

                <div className="trade-benefit">
                  <span className="trade-benefit-icon">◎</span>
                  <div>
                    <strong>Best routes</strong>
                    <small>Smart execution</small>
                  </div>
                </div>
              </div>

              <div className="trade-savings">
                <div className="trade-savings-main">
                  <span>ON A $10,000 VOLUME</span>
                  <strong>~$50</strong>
                  <small>kept in your pocket</small>
                </div>

                <div className="trade-savings-compare">
                  <div>
                    <span>Auevo</span>
                    <strong>$50 · 0.5%</strong>
                  </div>
                  <div>
                    <span>Typical bot</span>
                    <strong>$100+ · ~1%</strong>
                  </div>
                </div>
              </div>

              <div className="trade-signoff">
                TRADE FASTER. PAY LESS.
              </div>
            </div>
          </div>

          <div className="trade-swap-side">
            <div className="trade-swap-glow" />

            <div
              className={`trade-widget-frame trade-widget-frame-${swapState}`}
            >
              <div id="jupiter-plugin" />

              {!scriptLoaded && (
                <p className="trade-loading">Loading swap…</p>
              )}
            </div>

            {swapState === "success" && (
              <p className="trade-swap-status trade-swap-status-success">
                ✓ Swap successful
              </p>
            )}
            {swapState === "error" && (
              <p className="trade-swap-status trade-swap-status-error">
                ✕ Swap failed — try again
              </p>
            )}

            <div className="trade-trust-row">
              <div>
                <strong>{FEE_BPS / 100}%</strong>
                <span>Platform fee</span>
              </div>
              <div>
                <strong>MEV</strong>
                <span>Protection</span>
              </div>
              <div>
                <strong>Fast</strong>
                <span>Routing</span>
              </div>
              <div>
                <strong>Yours</strong>
                <span>Non-custodial</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
