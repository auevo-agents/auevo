import { proofMaterial, type ForestAgent, type ForestProof } from '../forest-model';

// The 12-slot front row is a deliberately curated composition (matches the
// original mockup's spacing); agents beyond it fall back to a procedural
// grid so the directory never silently truncates — forestLayout (the
// pre-garden renderer) showed up to 28, so a hard 12-cap here would be a
// visible regression. This grid is still a fixed, bounded layout, not the
// per-agent server-allocated world position the continuous-world spec
// calls for — that's a separate, not-yet-built piece (see dev-log).
export const GARDEN_AGENT_LIMIT = 48;
export const GARDEN_PROOF_LIMIT = 64;
export const DEMO_DURATION = 7;
export function seedOf(value: string) {
  let n = 2166136261;
  for (let i = 0; i < value.length; i++) n = Math.imul(n ^ value.charCodeAt(i), 16777619);
  return n >>> 0;
}
export function noise(n: number) { const v = Math.sin(n * 127.13 + 17.7) * 43758.54; return v - Math.floor(v); }
const FRONT_ROW: [number, number][] = [[-3.25, .9], [0, -2.1], [3.25, .55], [-5.4, -3.6], [5.5, -3.6], [-2.8, -5.8], [2.8, -5.8], [0, -8.3], [-5.5, -7.6], [5.5, -7.6], [-3, -10.4], [3, -10.4]];
export function gardenLayout(agents: ForestAgent[], single = false) {
  const shown = agents.slice(0, single ? 1 : GARDEN_AGENT_LIMIT);
  return shown.map((agent, index) => {
    let x: number, z: number;
    if (single) { x = 0; z = -.8; }
    else if (index < FRONT_ROW.length) { [x, z] = FRONT_ROW[index]; }
    else {
      const overflow = index - FRONT_ROW.length, col = overflow % 7, row = Math.floor(overflow / 7);
      x = (col - 3) * 3.1; z = -12.6 - row * 2.9;
    }
    return { agent, x, z, y: .025, seed: seedOf(agent.id) };
  });
}
export function gardenFacets(agent: ForestAgent) {
  const sorted = [...agent.proofs].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const shown = sorted.slice(-GARDEN_PROOF_LIMIT);
  const stem = .72 + Math.min(1.6, Math.log2(1 + agent.proofs.length) * .32);
  return { stem, omitted: Math.max(0, sorted.length - shown.length), facets: shown.flatMap((proof: ForestProof) => {
    const seed = seedOf(proof.id + agent.id);
    const angle = noise(seed) * Math.PI * 2;
    const level = noise(seed + 1), r = .25 + Math.sin(level * Math.PI) * .85;
    const x = Math.cos(angle) * r, z = Math.sin(angle) * r, y = stem + .18 + level * 1.05;
    const size = .25 + noise(seed + 2) * .14;
    return [0,1,2].map(i => ({ x: x + (i === 1 ? size*.72 : 0), y: y + (i === 2 ? size*.8 : 0), z, size: size*(i ? .78 : 1), material: proofMaterial(proof), proofId: proof.id }));
  }) };
}
export function demoPose(seconds: number, home: { x:number; y:number; z:number }, court: {x:number; y:number; z:number}, reduced = false) {
  const t = Math.max(0, Math.min(DEMO_DURATION, seconds));
  if (t >= DEMO_DURATION) return { ...home, phase: 'complete', pulse: false };
  const phase = t < 2.4 ? 'walking' : t < 4.6 ? 'trial' : t < DEMO_DURATION ? 'returning' : 'complete';
  let q = t < 2.4 ? t/2.4 : t < 4.6 ? 1 : 1-(t-4.6)/2.4;
  q = reduced ? (phase === 'trial' ? 1 : 0) : q*q*(3-2*q);
  return { phase, x: home.x + (court.x-home.x)*q, z: home.z + (court.z-home.z)*q,
    y: home.y + (court.y-home.y)*q + (reduced ? 0 : Math.abs(Math.sin(t*9))*.065), pulse: phase === 'trial' };
}
