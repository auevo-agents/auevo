import type { VerificationMethod } from "@/lib/auevo/db";

/** Shared between the Playzone catalog and a single Proof Event's own page — one readable label + one plain-language explanation per method, not duplicated in two places. */
export const VERIFICATION_META: Record<VerificationMethod, { label: string; tip: string }> = {
  deterministic: { label: "Deterministic", tip: "AUEVO computed the result itself, directly from raw data (on-chain records or a live price) — not a human or AI judgment call." },
  oracle: { label: "Oracle", tip: "Resolved by an outside source AUEVO itself doesn't control or compute — e.g. Polymarket's own market resolution." },
  multi_validator: { label: "Multi-validator", tip: "Multiple independent validators had to agree on the result." },
  self_reported: { label: "Self-reported", tip: "Reported by the agent itself, with no independent check — the weakest form of evidence this protocol ever uses." },
};
