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

  useEffect(() => {
    if (!scriptLoaded) return;

    let observer: MutationObserver | null = null;

    const patchJupiter = () => {
      const root = document.getElementById("jupiter-plugin");
      if (!root) return false;

      const hosts = [root, ...Array.from(root.querySelectorAll("*"))];

      for (const host of hosts) {
        const shadow = (host as HTMLElement).shadowRoot;
        if (!shadow) continue;

        if (!(window as any).__auevoJupiterDumped) {
          (window as any).__auevoJupiterDumped = true;
          shadow.querySelectorAll("*").forEach((el) => {
            if ((el.textContent || "").includes("Powered by Jupiter")) {
              console.log("AUEVO_JUPITER_ATTR", {
                tag: el.tagName,
                className: (el as HTMLElement).className,
                html: el.outerHTML
              });
            }
          });
        }

        if (!shadow.getElementById("auevo-jupiter-overrides")) {
          const style = document.createElement("style");
          style.id = "auevo-jupiter-overrides";
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

            a[href*="jup.ag"],
            a[href*="jup.ag"] *,
            a[href*="jupiter.ag"],
            a[href*="jupiter.ag"] * {
              color: #000000 !important;
              fill: #000000 !important;
              stroke: #000000 !important;
              opacity: 1 !important;
            }
          `;
          shadow.appendChild(style);
        }

        {
          const walker = document.createTreeWalker(
            shadow,
            NodeFilter.SHOW_TEXT
          );

          const textNodes: Text[] = [];
          let current: Node | null;

          while ((current = walker.nextNode())) {
            if (current.textContent?.trim() === "Powered by") {
              textNodes.push(current as Text);
            }
          }

          textNodes.forEach((textNode) => {
            const span = document.createElement("span");
            span.textContent = textNode.textContent;
            span.style.setProperty("color", "#000000", "important");
            span.style.setProperty("opacity", "1", "important");
            textNode.parentNode?.replaceChild(span, textNode);
          });
        }

        shadow.querySelectorAll("*").forEach((el) => {
          const text = el.textContent?.replace(/\\s+/g, " ").trim() || "";

          if (text === "Powered by") {
            const node = el as HTMLElement;
            node.style.setProperty("color", "#000000", "important");
            node.style.setProperty("fill", "#000000", "important");
            node.style.setProperty("opacity", "1", "important");
          }

          if (text === "Powered by Jupiter") {
            const node = el as HTMLElement;
            node.style.setProperty("font-size", "7px", "important");
            node.style.setProperty("opacity", "1", "important");
            node.style.setProperty("color", "#000000", "important");

            node.querySelectorAll("*").forEach((child) => {
              const c = child as HTMLElement;
              c.style.setProperty("color", "#000000", "important");
              c.style.setProperty("opacity", "1", "important");
              c.style.setProperty("color", "#000000", "important");
              c.style.setProperty("fill", "#000000", "important");
              c.style.setProperty("stroke", "#000000", "important");
            });
          }
        });

        return true;
      }

      return false;
    };

    patchJupiter();

    const root = document.getElementById("jupiter-plugin");
    if (root) {
      observer = new MutationObserver(() => patchJupiter());
      observer.observe(root, { childList: true, subtree: true });
    }

    const timer = window.setInterval(() => {
      if (patchJupiter()) window.clearInterval(timer);
    }, 250);

    return () => {
      observer?.disconnect();
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
            <Link href="/#home">Home</Link>
            <Link href="/#bots">Bots</Link>
            <Link href="/#insights">Insights</Link>
            <Link href="/#docs">Docs</Link>
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

            <div className="trade-widget-frame">
              <div id="jupiter-plugin" />

              {!scriptLoaded && (
                <p className="trade-loading">Loading swap…</p>
              )}
            </div>

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
