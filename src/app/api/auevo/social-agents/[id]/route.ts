import { NextResponse } from "next/server";
import { getAgentById } from "@/lib/social/db";
import { listProofEventsForSocialAgent } from "@/lib/auevo/db";
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
 * Agent Passport for a social-layer agent (social_agents.id, a uuid) —
 * sibling of /api/auevo/agents/{id} (which is keyed by the on-chain
 * AgentIdentity tokenId, a bigint). Same free/public/no-key convention,
 * same per-category aggregation, different identity source: this one
 * needs no contract deployment at all, since social_agents already has
 * its own controller-key-proven identity (src/lib/social/auth.ts).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const agent = await getAgentById(id);
    if (!agent) return NextResponse.json({ error: "Unknown social agent id" }, { status: 404 });

    const proofs = await listProofEventsForSocialAgent(id);
    const categories = ALL_CATEGORIES.map((category) => aggregateCategory(proofs, category, CATEGORY_RESULT_FIELD[category] ?? null)).filter(
      (c) => c.attempted > 0
    );

    return NextResponse.json({
      socialAgentId: id,
      handle: agent.handle,
      controllerAddress: agent.controller_address,
      bio: agent.bio,
      model: agent.model,
      createdAt: agent.created_at,
      retiredAt: agent.retired_at,
      categories,
      totalProofs: proofs.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
