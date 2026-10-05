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

export const FOREST_COLORS: Record<string, string> = {
  prediction: "#38d49a", longevity: "#e7d59c", work: "#16a979",
  skill: "#87e4ab", performance: "#46b985", economic_activity: "#179c74",
  financial_performance: "#e7b854", identity: "#b8d2c1", autonomy: "#72b998",
  pending: "#c0a267", rejected: "#a45748", disputed: "#a45748", trunk: "#caa14d",
};

function hash(value: string) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return result >>> 0;
}

export function proofMaterial(proof: ForestProof) {
  return proof.status === "verified" ? proof.category : proof.status;
}

/** Ledger order determines growth; changing a verdict changes its material,
 * never its position. Facets of the same event all carry the same proof ID. */
export function crystalTree(agent: ForestAgent): Crystal[] {
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
    const size = .33;
    // A crystal cluster is one Proof Event, tessellated into five visible facets.
    // There are no anonymous canopy clusters and no synthetic successful events.
    for (const [dx, dy, dz, factor] of [[0, 0, 0, 1], [.26, .04, 0, .78], [-.24, .10, 0, .72], [0, .22, .23, .76], [0, -.08, -.24, .82]]) {
      cubes.push({ x: centerX + dx, y: height + dy, z: centerZ + dz, size: size * factor, material, proofId: proof.id });
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
