import { NextResponse } from "next/server";
import { readAgentIdentity } from "@/lib/auevo/identity";
import { listProofEventsForAgent } from "@/lib/auevo/db";
import { aggregateCategory, CATEGORY_RESULT_FIELD } from "@/lib/auevo/score";
import type { ProofCategory } from "@/lib/auevo/db";

export const runtime = "nodejs";

const ALL_CATEGORIES: ProofCategory[] = [
  "identity",
  "skill",
  "work",
  "performance",
  "economic_activity",
  "financial_performance",
  "prediction",
  "autonomy",
  "longevity",
];

/**
 * Free, public, no-key Agent Passport summary — same tiering idea as
 * /api/credit/check: a basic verdict for free, full Proof history via
 * /api/auevo/agents/{id}/proofs. Every number here is recomputed live
 * from the Proof corpus (design doc §14) — nothing here is a stored,
 * trust-us score.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9]+$/.test(id)) {
    return NextResponse.json({ error: "agent id must be a non-negative integer" }, { status: 400 });
  }

  try {
    const [identity, proofs] = await Promise.all([readAgentIdentity(BigInt(id)), listProofEventsForAgent(id)]);

    const categories = ALL_CATEGORIES.map((category) => aggregateCategory(proofs, category, CATEGORY_RESULT_FIELD[category] ?? null)).filter(
      (c) => c.attempted > 0
    );

    return NextResponse.json({
      agentId: id,
      identity: identity
        ? {
            owner: identity.owner,
            controller: identity.controller,
            operatorWallet: identity.operatorWallet,
            agentURI: identity.agentURI,
            registeredAt: identity.registeredAt.toString(),
          }
        : null,
      identityDeployed: Boolean(process.env.NEXT_PUBLIC_AUEVO_IDENTITY_ADDRESS?.trim()),
      categories,
      totalProofs: proofs.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
