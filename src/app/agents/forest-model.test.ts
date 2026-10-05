import { describe, expect, it } from "vitest";
import { crystalTree, forestLayout, type ForestAgent } from "./forest-model";

const agent: ForestAgent = { id: "agent-one", handle: "one", bio: null, ageDays: 2, attempted: 2, verified: 1, pending: 1, rejected: 0, dominantCategory: "prediction", createdAt: "2026-10-01", proofs: [
  { id: "second", category: "work", status: "pending", createdAt: "2026-10-03" },
  { id: "first", category: "prediction", status: "verified", createdAt: "2026-10-02" },
] };

describe("ledger-derived crystal forest", () => {
  it("never invents canopy proofs for a new agent", () => {
    expect(crystalTree({ ...agent, proofs: [], attempted: 0, verified: 0, pending: 0 }).filter(c => c.proofId)).toEqual([]);
  });
  it("retains every proof including unsuccessful outcomes", () => {
    const rejected = { ...agent, proofs: [...agent.proofs, { id: "failed", category: "skill", status: "rejected", createdAt: "2026-10-04" }] };
    const cubes = crystalTree(rejected).filter(c => c.proofId);
    expect(new Set(cubes.map(c => c.proofId))).toEqual(new Set(["first", "second", "failed"]));
    expect(cubes.filter(c => c.proofId === "failed").every(c => c.material === "rejected")).toBe(true);
  });
  it("changes a verdict without moving its permanent history", () => {
    const before = crystalTree(agent);
    const after = crystalTree({ ...agent, proofs: agent.proofs.map(p => ({ ...p, status: "verified" })) });
    expect(after.map(({ material: _material, ...c }) => c)).toEqual(before.map(({ material: _material, ...c }) => c));
    expect(after.filter(c => c.proofId === "second").every(c => c.material === "work")).toBe(true);
  });
  it("recomputes the same geometry regardless of API row order", () => {
    expect(crystalTree({ ...agent, proofs: [...agent.proofs].reverse() })).toEqual(crystalTree(agent));
  });
  it("keeps one identifiable tree per displayed agent", () => {
    const records = Array.from({ length: 28 }, (_, i) => ({ ...agent, id: String(i), handle: String(i) }));
    const layout = forestLayout(records);
    expect(layout).toHaveLength(28);
    expect(new Set(layout.map(item => `${item.x}/${item.z}`)).size).toBe(28);
    expect(forestLayout([])).toEqual([]);
  });
});
