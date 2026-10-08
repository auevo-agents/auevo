import { useId } from "react";
import { crystalTree, FOREST_COLORS, type ForestAgent } from "./forest-model";

// crystalTree()'s default mode tessellates EVERY proof into ~80 facets
// (an SVG <path> trio each) — fine for the full interactive 3D bloom, but
// this icon renders at ~40-70px and is reused per row in listings of up
// to 200 agents. { simple: true } below swaps that for one crystal per
// proof (still every real event, just untessellated); ICON_PROOF_LIMIT is
// a second, defense-in-depth cap for the rare agent with an unusually
// long history — together these keep a handful of heavily-tested agents
// from turning this thumbnail into thousands of paths each, which was
// measured ballooning /agents to an 8MB response on its own.
const ICON_PROOF_LIMIT = 64;

/** A light, accessible isometric thumbnail generated from the SAME ledger
 * geometry as the interactive scene, also usable when WebGL is unavailable. */
export function AgentTreeIcon({ agent }: { agent: ForestAgent }) {
  const id=useId().replaceAll(":", "");
  const proofs = agent.proofs.length > ICON_PROOF_LIMIT
    ? [...agent.proofs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, ICON_PROOF_LIMIT)
    : agent.proofs;
  const crystals = crystalTree(proofs === agent.proofs ? agent : { ...agent, proofs }, { simple: true });
  const top = Math.max(1.2, ...crystals.map(c => c.y + c.size));
  const scale = Math.min(22, 49 / top);
  return <svg viewBox="0 0 72 72" fill="none" aria-hidden="true">
    <defs>{Object.entries(FOREST_COLORS).map(([name,color])=><linearGradient key={name} id={`${id}-${name}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={color}/><stop offset=".38" stopColor={color}/><stop offset=".46" stopColor="#f6eecb" stopOpacity=".85"/><stop offset=".54" stopColor={color}/><stop offset="1" stopColor={color} stopOpacity=".4"/></linearGradient>)}</defs>
    <ellipse cx="36" cy="63" rx="22" ry="6" fill="#030a07" />
    <path d="M14 59 36 53 58 59 36 66Z" fill="#1d2e20" stroke="#756237" strokeWidth=".6" />
    {[...crystals].sort((a, b) => b.z - a.z || a.y - b.y).map((c, i) => {
      const x = 36 + (c.x - c.z) * scale * .8;
      const y = 61 - c.y * scale + (c.x + c.z) * scale * .27;
      const s = c.size * scale;
      const color = FOREST_COLORS[c.material] ?? "#88b598";
      return <g key={i} stroke={color} strokeWidth=".22" strokeLinejoin="round">
        <path d={`M${x} ${y-s*.45}l${s*.7} ${s*.25}v${s*.7}l${-s*.7} ${-s*.25}Z`} fill={`url(#${id}-${c.material})`} fillOpacity=".88" />
        <path d={`M${x} ${y-s*.45}l${-s*.7} ${s*.25}v${s*.7}l${s*.7} ${-s*.25}Z`} fill={color} fillOpacity=".38" />
        <path d={`M${x} ${y-s*.45}l${s*.7} ${s*.25} ${-s*.7} ${s*.25} ${-s*.7} ${-s*.25}Z`} fill={`url(#${id}-${c.material})`} fillOpacity="1" />
      </g>;
    })}
  </svg>;
}
