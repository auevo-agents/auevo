"use client";

import { useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { shortenAddress } from "@/lib/format";
import { CopyButton } from "../../copy-button";

/**
 * The funding graph — who holds this token and who funded whom, among the
 * biggest holders. Real data (see src/lib/evm/holders.ts: every edge comes
 * from an actual Transfer event already read while computing holder
 * concentration, restricted to edges between the addresses shown as
 * nodes), laid out with d3-force rather than a hand-rolled physics loop —
 * force-directed graph layout is exactly what that library is for.
 *
 * A cluster of wallets that all trace back to one funding source is the
 * pattern this is for — bundlers, sniper wallets, a single actor behind
 * many "different" holders. This shows the shape; it does not label
 * anything as bad — that's still the Token Scanner's job.
 */

export interface GraphNode {
  address: string;
  percent: number;
  kind: "holder" | "mint";
}

export interface GraphEdge {
  from: string;
  to: string;
  value: string;
}

interface LaidOutNode extends GraphNode, SimulationNodeDatum {
  radius: number;
}

const WIDTH = 900;
const HEIGHT = 620;

function radiusFor(node: GraphNode): number {
  if (node.kind === "mint") return 14;
  // Square-root scale so radius (and so area) tracks holding size without
  // one whale's circle swallowing the whole canvas.
  return 6 + Math.sqrt(Math.max(node.percent, 0.05)) * 9;
}

function layout(nodes: GraphNode[], edges: GraphEdge[]): Map<string, LaidOutNode> {
  const simNodes: LaidOutNode[] = nodes.map((n) => ({ ...n, radius: radiusFor(n) }));
  const byAddress = new Map(simNodes.map((n) => [n.address.toLowerCase(), n]));

  // Only edges whose both ends actually made it into the node set — a
  // stray edge referencing a node d3 can't find would just be dropped
  // silently, so it's filtered here instead.
  const links: SimulationLinkDatum<LaidOutNode>[] = edges
    .filter((e) => byAddress.has(e.from.toLowerCase()) && byAddress.has(e.to.toLowerCase()))
    .map((e) => ({ source: e.from.toLowerCase(), target: e.to.toLowerCase() }));

  const simulation = forceSimulation(simNodes)
    .force("charge", forceManyBody().strength(-140))
    .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
    .force(
      "collide",
      forceCollide<LaidOutNode>().radius((n) => n.radius + 6)
    )
    .force(
      "link",
      forceLink<LaidOutNode, SimulationLinkDatum<LaidOutNode>>(links)
        .id((n) => n.address.toLowerCase())
        .distance(90)
        .strength(0.25)
    )
    .stop();

  for (let i = 0; i < 260; i++) simulation.tick();

  return byAddress;
}

function edgeWeight(edges: GraphEdge[]): Map<GraphEdge, number> {
  let max = 0n;
  const values = edges.map((e) => {
    try {
      const v = BigInt(e.value);
      if (v > max) max = v;
      return v;
    } catch {
      return 0n;
    }
  });

  const weights = new Map<GraphEdge, number>();
  edges.forEach((edge, i) => {
    weights.set(edge, max > 0n ? Number((values[i] * 1000n) / max) / 1000 : 0);
  });
  return weights;
}

export function ConstellationMap({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const positioned = useMemo(() => layout(nodes, edges), [nodes, edges]);
  const weights = useMemo(() => edgeWeight(edges), [edges]);

  const [view, setView] = useState({ x: 0, y: 0, w: WIDTH, h: HEIGHT });
  const [hover, setHover] = useState<GraphNode | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const scale = e.deltaY > 0 ? 1.1 : 0.9;
    setView((v) => {
      const w = Math.max(200, Math.min(WIDTH * 3, v.w * scale));
      const h = Math.max(140, Math.min(HEIGHT * 3, v.h * scale));
      return { x: v.x - (w - v.w) / 2, y: v.y - (h - v.h) / 2, w, h };
    });
  }

  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { x: e.clientX, y: e.clientY };
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragRef.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = view.w / rect.width;
    const scaleY = view.h / rect.height;
    const dx = (e.clientX - dragRef.current.x) * scaleX;
    const dy = (e.clientY - dragRef.current.y) * scaleY;
    dragRef.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
  }
  function endDrag() {
    dragRef.current = null;
  }

  return (
    <div className="constellation-wrap">
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className="constellation-svg"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        {edges.map((edge, i) => {
          const a = positioned.get(edge.from.toLowerCase());
          const b = positioned.get(edge.to.toLowerCase());
          if (!a || !b || a.x === undefined || b.x === undefined) return null;
          const w = weights.get(edge) ?? 0;
          // Surface-to-surface, not center-to-center — otherwise a line
          // into a large (high-%) node is mostly hidden under its own
          // circle instead of visibly touching it.
          const dx = (b.x ?? 0) - (a.x ?? 0);
          const dy = (b.y ?? 0) - (a.y ?? 0);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const ux = dx / dist;
          const uy = dy / dist;
          return (
            <line
              key={`${edge.from}-${edge.to}-${i}`}
              x1={(a.x ?? 0) + ux * a.radius}
              y1={(a.y ?? 0) + uy * a.radius}
              x2={(b.x ?? 0) - ux * b.radius}
              y2={(b.y ?? 0) - uy * b.radius}
              stroke="#ff4259"
              strokeOpacity={0.18 + w * 0.5}
              strokeWidth={0.8 + w * 2.5}
              strokeLinecap="round"
            />
          );
        })}

        {[...positioned.values()].map((node) => (
          <g
            key={node.address}
            transform={`translate(${node.x ?? 0}, ${node.y ?? 0})`}
            onMouseEnter={() => setHover(node)}
            onMouseLeave={() => setHover((h) => (h?.address === node.address ? null : h))}
            style={{ cursor: "pointer" }}
            onClick={() =>
              window.open(`https://robinhoodchain.blockscout.com/address/${node.address}`, "_blank")
            }
          >
            <circle
              r={node.radius}
              fill={node.kind === "mint" ? "#0a0e10" : "rgba(255,52,77,.16)"}
              stroke={node.kind === "mint" ? "#5a6469" : "#ff4259"}
              strokeWidth={node.kind === "mint" ? 1 : 1.4}
              strokeDasharray={node.kind === "mint" ? "3 2" : undefined}
            />
            {node.radius > 12 && (
              <text
                textAnchor="middle"
                dy={4}
                fontSize={10}
                fill="#eef0ef"
                style={{ pointerEvents: "none", fontFamily: "ui-monospace, monospace" }}
              >
                {node.kind === "mint" ? "mint" : shortenAddress(node.address, 3, 2)}
              </text>
            )}
          </g>
        ))}
      </svg>

      {hover && (
        <div className="constellation-tooltip">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <code className="scan-mono">{hover.address}</code>
            <CopyButton value={hover.address} />
          </span>
          <span>{hover.kind === "mint" ? "Origin of supply (zero address)" : `${hover.percent.toFixed(2)}% of supply`}</span>
        </div>
      )}

      <div className="constellation-legend">
        <span>
          <i className="constellation-dot" /> holder — size ≈ % of supply
        </span>
        <span>
          <i className="constellation-dot constellation-dot-mint" /> mint (zero address)
        </span>
        <span>line thickness ≈ transfer size · scroll to zoom, drag to pan</span>
      </div>
    </div>
  );
}
