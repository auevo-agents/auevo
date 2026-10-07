/** Public, minimal ledger data. No commitments, wallet keys or server credentials
 * are needed to draw a tree. Each proof owns a stable cluster of crystal facets;
 * roots, trunk and plinth are decorative geometry, not additional Proof Events. */
import type { ProofCategory } from "@/lib/auevo/db";

export type ForestProof = {
  id: string;
  category: string;
  status: string;
  createdAt: string;
};

export type ForestAgent = {
  id: string;
  handle: string;
  bio: string | null;
  ageDays: number;
  attempted: number;
  verified: number;
  pending: number;
  rejected: number;
  dominantCategory: ProofCategory | null;
  createdAt: string;
  proofs: ForestProof[];
};

export type Crystal = {
  x: number; y: number; z: number; size: number;
  material: string;
  proofId?: string;
};

// Each of the 9 real categories gets its own hue family (not just a
// different shade of green) so a glance at a crystal, a legend dot, or a
// trial-court building tells categories apart at a distance.
export const FOREST_COLORS: Record<string, string> = {
  prediction: "#38d49a", longevity: "#e8dcb0", work: "#e0953f",
  skill: "#5fb0e0", performance: "#b07adb", economic_activity: "#43c7c2",
  financial_performance: "#e7b854", identity: "#d881a8", autonomy: "#8291c9",
  // Unsettled (not yet a win or a loss): same tan as the old single
  // "pending" used to be.
  scheduled: "#c0a267", running: "#c0a267", awaiting_settlement: "#c0a267",
  // A genuine resolved loss, or withdrawn: same red the old "rejected"/
  // "disputed" used to be.
  failed: "#a45748", cancelled: "#a45748",
  // Distinct from failed — the settlement source was unavailable, not a
  // loss attributable to the agent.
  inconclusive: "#8a8a8a",
  trunk: "#caa14d",
};

function hash(value: string) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return result >>> 0;
}

export function proofMaterial(proof: ForestProof) {
  return proof.status === "passed" ? proof.category : proof.status;
}

/** Ledger order determines growth; changing a verdict changes its material,
 * never its position. Facets of the same event all carry the same proof ID.
 * `simple`: skip the ~80-facet-per-proof tessellation and push one crystal
 * per proof instead — for AgentTreeIcon, a ~40-70px thumbnail where that
 * detail is invisible but was measured costing 200+ paths per proof once
 * rendered (see agent-tree-icon.tsx). The full interactive 3D bloom keeps
 * calling this with no options, unaffected. */
export function crystalTree(agent: ForestAgent, opts?: { simple?: boolean }): Crystal[] {
  const proofs = [...agent.proofs].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const growth = Math.log2(1 + proofs.length);
  const trunkHeight = .62 + Math.min(1.3, growth * .31);
  const cubes: Crystal[] = [];
  const segments = Math.ceil(trunkHeight / .22);
  for (let i = 0; i < segments; i++) {
    cubes.push({ x: 0, y: .24 + i * .215, z: 0, size: .245 - (i / segments) * .04, material: "trunk" });
  }
  // Four rooted steps; decorative, intentionally not counted as proofs.
  for (const [x, z] of [[-.24, 0], [.24, 0], [0, -.24], [0, .24]]) {
    cubes.push({ x, y: .15, z, size: .22, material: "trunk" });
  }

  const seed = (hash(agent.id) % 628) / 100;
  proofs.forEach((proof, i) => {
    const angle = seed + i * 2.399963;
    const ring = Math.floor(i / 7);
    const radius = proofs.length === 1 ? .08 : .30 + Math.min(.65, ring * .1);
    const height = trunkHeight + .28 + (i % 7) * .095 + ring * .09;
    const centerX = Math.cos(angle) * radius;
    const centerZ = Math.sin(angle) * radius;
    const material = proofMaterial(proof);
    const size = .36;
    if (opts?.simple) {
      cubes.push({ x: centerX, y: height, z: centerZ, size, material, proofId: proof.id });
    } else {
      // One Proof Event owns a stepped crown, tessellated into glass facets.
      // There are no anonymous canopy clusters and no synthetic successful events.
      const facets: number[][] = [];
      // Every facet of this branched crystal crown retains the real event ID.
      for(let tier=0;tier<4;tier++){
        const width=tier===3?1:tier===0?2:3;
        for(let x=-width;x<=width;x++)for(let z=-width;z<=width;z++){
          if(Math.abs(x)+Math.abs(z)>width+1 || (Math.abs(x)+Math.abs(z)>1 && (x*3+z+tier)%3===0))continue;
          facets.push([x*.23+Math.sin(tier+i)*.07,tier*.23,z*.23,(Math.abs(x)+Math.abs(z)>width)?.57:.67]);
        }
      }
      for (const [dx, dy, dz, factor] of facets) {
        cubes.push({ x: centerX + dx, y: height + dy, z: centerZ + dz, size: size * factor, material, proofId: proof.id });
      }
    }
    // Gold branch segments connecting growth to the trunk.
    for (let step = 1; step <= 2; step++) {
      const t = step / 3;
      cubes.push({ x: centerX * t, y: trunkHeight + (height - trunkHeight) * t, z: centerZ * t, size: .15, material: "trunk" });
    }
  });
  return cubes;
}

export function forestLayout(agents: ForestAgent[]) {
  // Showcase the strongest public records in front, with young growth behind.
  // Fixed slots make the starting view match the wide composition of the mockup.
  const slots = [[0, .6], [-3.25, .2], [3.25, .15], [-6.25, -.8], [6.25, -.9], [-4.7, -3.1], [4.7, -3.2], [0, -3.8]];
  return agents.slice(0, 28).map((agent, i) => {
    const position = slots[i] ?? [((i - 8) % 7 - 3) * 2.65, -6.6 - Math.floor((i - 8) / 7) * 2.8];
    return { agent, x: position[0], z: position[1], crystals: crystalTree(agent) };
  });
}
