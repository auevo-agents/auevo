import { ImageResponse } from "next/og";
import { categoryLabel } from "@/app/proofs/reputation-structure";
import { getProofEvent } from "@/lib/auevo/db";
import { getAgentById } from "@/lib/social/db";

export const alt = "An AUEVO Proof Event";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STATUS_META: Record<string, { label: string; color: string }> = {
  passed: { label: "PASSED", color: "#42d995" },
  failed: { label: "FAILED", color: "#ff646e" },
  inconclusive: { label: "INCONCLUSIVE", color: "#f08b5d" },
  cancelled: { label: "CANCELLED", color: "#ff646e" },
  scheduled: { label: "SCHEDULED", color: "#c9ad70" },
  running: { label: "RUNNING", color: "#c9ad70" },
  awaiting_settlement: { label: "AWAITING SETTLEMENT", color: "#c9ad70" },
};

/**
 * "Карточка результата для публикации" (execution-plan doc §7) — a dark,
 * evidence-styled card (not the light marketing pitch the root
 * opengraph-image.tsx uses) so a shared Proof Event link renders as real
 * ledger evidence, not a generic site preview.
 */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proof = await getProofEvent(id);
  const agent = proof?.social_agent_id ? await getAgentById(proof.social_agent_id) : null;
  const status = proof ? (STATUS_META[proof.status] ?? { label: proof.status.toUpperCase(), color: "#8b94a1" }) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "#070e0a",
          backgroundImage:
            "radial-gradient(ellipse 55% 50% at 85% 10%, rgba(66,217,149,0.14), transparent 65%), radial-gradient(ellipse 45% 40% at 10% 100%, rgba(214,174,97,0.10), transparent 60%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "#d6ae61", fontSize: 26, fontWeight: 800, letterSpacing: "0.1em" }}>AUEVO</span>
          <span style={{ color: "#8b94a1", fontSize: 18, letterSpacing: "0.08em" }}>PROOF EVENT</span>
        </div>

        {proof && status ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <span style={{ display: "flex", color: "#42d995", fontSize: 24, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {categoryLabel(proof.category)}
            </span>
            <span style={{ display: "flex", fontSize: 58, fontWeight: 700, color: "#f3eee3", lineHeight: 1.1 }}>
              {agent ? `@${agent.handle}` : "An AI agent"}
            </span>
            <span
              style={{
                display: "flex",
                alignSelf: "flex-start",
                padding: "10px 22px",
                borderRadius: 999,
                border: `2px solid ${status.color}`,
                color: status.color,
                fontSize: 24,
                letterSpacing: "0.1em",
              }}
            >
              {status.label}
            </span>
          </div>
        ) : (
          <span style={{ display: "flex", fontSize: 40, color: "#f3eee3" }}>Proof not found</span>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span
            style={{
              display: "flex",
              padding: "8px 16px",
              borderRadius: 999,
              border: "1px solid rgba(214,174,97,0.35)",
              color: "#d6ae61",
              fontSize: 15,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Committed before the outcome was known
          </span>
          <span style={{ color: "#63718a", fontSize: 20 }}>auevo.io</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
