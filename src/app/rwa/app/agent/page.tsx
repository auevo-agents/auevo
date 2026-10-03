import { Disclaimer } from "@/app/disclaimer";
import { ConciergeChat } from "./concierge-chat";

/**
 * RWA_SPEC.md's planned "elite AUEVO AI concierge" — a guide meant to walk
 * a user through the platform and toward using it well (which basket fits
 * a goal, how rebalancing works, what a risk score means, and so on).
 * Live: Claude Haiku 4.5 (api/rwa/agent/chat), grounded only in the real
 * /docs content (src/lib/docs-corpus.ts) — no tool access, no wallet
 * access, cannot place a trade or move funds. See that route's system
 * prompt for the exact constraints.
 */
export default function AgentPage() {
  return (
    <>
      <div className="dash-hero">
        <p className="dash-eyebrow">Live · AUEVO AI</p>
        <h1 className="dash-title">Your elite trading concierge.</h1>
        <p className="dash-subtitle">
          Built into the platform, not bolted on — it explains what you&apos;re looking at, walks you
          through baskets, pools and lending, and helps you invest with more confidence. It never places
          a trade or moves funds on its own.
        </p>
      </div>

      <ConciergeChat />

      <div className="dash-list-card" style={{ padding: 24, marginTop: 16 }}>
        <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.7, color: "var(--muted)" }}>
          <strong style={{ color: "#f2f4f3" }}>What it does today:</strong>
        </p>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.9, color: "var(--muted)" }}>
          <li>Explains any asset, risk score, fee, or feature on this site in plain language.</li>
          <li>Helps you figure out which basket or feature fits what you&apos;re trying to do.</li>
          <li>Walks you through a feature step by step the first time you use it — baskets, lending, LP.</li>
          <li>Never places a trade or moves funds on its own — every action still needs your own signature.</li>
          <li>Won&apos;t invent a live price, APR, or risk score — it points you to the real page for the current number instead.</li>
        </ul>
      </div>

      <Disclaimer compact />
    </>
  );
}
