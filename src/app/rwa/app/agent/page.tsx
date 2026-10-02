import { Disclaimer } from "@/app/disclaimer";

/**
 * RWA_SPEC.md's planned "elite AUEVO AI concierge" — a guide meant to walk
 * a user through the platform and toward using it well (which basket fits
 * a goal, how rebalancing works, what a risk score means, and so on).
 * Not built yet: this is an honest "coming soon" preview, not a working
 * assistant wearing a placeholder skin — the chat transcript below is
 * illustrative copy, clearly labeled, never a live response.
 */
export default function AgentPage() {
  return (
    <>
      <div className="dash-hero">
        <p className="dash-eyebrow">Coming soon · AUEVO AI</p>
        <h1 className="dash-title">Your elite trading concierge.</h1>
        <p className="dash-subtitle">
          Built into the platform, not bolted on — it will explain what you&apos;re looking at, walk you
          through baskets, pools and lending, and help you invest with more confidence. Currently in
          training.
        </p>
      </div>

      <div className="agent-preview-card">
        <div className="agent-preview-header">
          <span className="agent-preview-dot" />
          <b>AUEVO AI</b>
          <span className="agent-preview-status">training…</span>
        </div>

        <div className="agent-preview-chat">
          <div className="agent-chat-row agent-chat-user">
            <span>What&apos;s the safest way to add TSLA exposure without overloading my portfolio?</span>
          </div>
          <div className="agent-chat-row agent-chat-bot">
            <span>
              Given your current allocation, a partial position sized to your risk tolerance — or one of
              the diversified baskets — usually beats a single-name buy for exposure like this…
            </span>
          </div>
          <div className="agent-chat-row agent-chat-user">
            <span>Walk me through how basket rebalancing works.</span>
          </div>
          <div className="agent-chat-row agent-chat-bot">
            <span>
              Each basket tracks target weights per holding. When a rebalance runs, it compares your
              actual weights to the targets and trades only what&apos;s needed to close the gap…
            </span>
          </div>
        </div>

        <div className="agent-preview-overlay">
          <span className="agent-preview-overlay-badge">Preview — illustrative, not a live response</span>
        </div>
      </div>

      <div className="dash-list-card" style={{ padding: 24 }}>
        <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.7, color: "var(--muted)" }}>
          <strong style={{ color: "#f2f4f3" }}>What it&apos;s meant to do, once it launches:</strong>
        </p>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.9, color: "var(--muted)" }}>
          <li>Explain any asset, risk score, or number on this site in plain language.</li>
          <li>Recommend a basket or allocation based on what you say you&apos;re trying to do.</li>
          <li>Walk you through a feature step by step the first time you use it — baskets, lending, LP.</li>
          <li>Never place a trade or move funds on its own — every action still needs your own signature.</li>
        </ul>
      </div>

      <Disclaimer compact />
    </>
  );
}
