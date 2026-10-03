import { NextResponse } from "next/server";
import { getAgentByHandle } from "@/lib/social/db";
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

/** Same Passport as /api/auevo/social-agents/{id}, looked up by @handle — the natural way a human finds the one real agent they know by name. */
export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  try {
    const { handle } = await params;
    const agent = await getAgentByHandle(handle.toLowerCase());
    if (!agent) return NextResponse.json({ error: "Unknown agent handle" }, { status: 404 });

    const proofs = await listProofEventsForSocialAgent(agent.id);
    const categories = ALL_CATEGORIES.map((category) => aggregateCategory(proofs, category, CATEGORY_RESULT_FIELD[category] ?? null)).filter(
      (c) => c.attempted > 0
    );

    return NextResponse.json({
      socialAgentId: agent.id,
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
