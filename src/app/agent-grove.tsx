"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { categoryAccent, categoryLabel } from "@/app/auevo/reputation-structure";
import type { AgentPortalRecord } from "@/lib/auevo/portal";

/**
 * A voxel "tree" per agent, inspired by priors.trade's /live grove — but
 * adapted to AUEVO's own rule (design doc / /auevo copy): no agent is ever
 * reduced to one combined pass/fail. priors burns a whole tree on a single
 * default; here, a bad outcome only ever shows on the ONE category branch
 * it happened in (a grey, leafless rim cube) — every other branch on the
 * same tree stays exactly as healthy as its own record says.
 *
 * Geometry is entirely derived from AgentPortalRecord (the same props
 * already driving the flat 2D AgentUniverse and the Passport page) — no
 * invented numbers, nothing hardcoded per agent:
 *   - trunk height  -> identity age (one segment per ~30 days, capped)
 *   - canopy size   -> verified Proof count (capped)
 *   - rim cubes     -> one per category this agent has attempted, colored
 *                      by that category's accent (src/app/auevo/reputation-structure.tsx,
 *                      the same palette the pixel Passport glyph uses) --
 *                      grey instead if that category has a rejected/disputed Proof.
 */

const GRID_COLS = 6;
const CELL = 2.6;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

interface TreeProps {
  record: AgentPortalRecord;
  position: [number, number, number];
  onHover: (record: AgentPortalRecord | null) => void;
}

function Tree({ record, position, onHover }: TreeProps) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<THREE.Group>(null);

  const trunkSegments = clamp(1 + Math.floor(record.ageDays / 30), 1, 5);
  const canopyCubes = clamp(1 + Math.floor(record.verified / 2), 1, 6);

  const rim = useMemo(() => {
    const n = record.categories.length;
    return record.categories.map((cat, i) => {
      const failed = record.proofs.some((p) => p.category === cat.category && (p.status === "rejected" || p.status === "disputed"));
      const angle = (i / Math.max(n, 1)) * Math.PI * 2;
      const radius = 0.55;
      return {
        category: cat.category,
        color: failed ? "#4a4e58" : categoryAccent(cat.category),
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
      };
    });
  }, [record]);

  useFrame(() => {
    if (groupRef.current) {
      const target = hovered ? 1.08 : 1;
      groupRef.current.scale.lerp(new THREE.Vector3(target, target, target), 0.15);
    }
  });

  const canopyY = trunkSegments * 0.5 + 0.3;
  const router = useRouter();

  return (
    <group
      ref={groupRef}
      position={position}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        onHover(record);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHovered(false);
        onHover(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        router.push(`/agents/${record.agent.handle}`);
      }}
    >
      {/* trunk */}
      {Array.from({ length: trunkSegments }).map((_, i) => (
        <mesh key={i} position={[0, i * 0.5 + 0.25, 0]} castShadow>
          <boxGeometry args={[0.26, 0.5, 0.26]} />
          <meshStandardMaterial color="#8a5a3a" roughness={0.9} />
        </mesh>
      ))}

      {/* canopy */}
      {Array.from({ length: canopyCubes }).map((_, i) => {
        const a = (i / canopyCubes) * Math.PI * 2;
        const r = canopyCubes > 1 ? 0.22 : 0;
        return (
          <mesh key={i} position={[Math.cos(a) * r, canopyY + (i % 2) * 0.22, Math.sin(a) * r]} castShadow>
            <boxGeometry args={[0.42, 0.42, 0.42]} />
            <meshStandardMaterial color={hovered ? "#8fd9ae" : "#5fae82"} roughness={0.75} />
          </mesh>
        );
      })}

      {/* category rim */}
      {rim.map((r, i) => (
        <mesh key={i} position={[r.x, canopyY + 0.1, r.z]}>
          <boxGeometry args={[0.14, 0.14, 0.14]} />
          <meshStandardMaterial color={r.color} emissive={r.color} emissiveIntensity={0.35} />
        </mesh>
      ))}

      {/* base marker */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.5, 0.04, 0.5]} />
        <meshStandardMaterial color="#1a1c22" />
      </mesh>
    </group>
  );
}

function Scene({ agents, onHover }: { agents: AgentPortalRecord[]; onHover: (r: AgentPortalRecord | null) => void }) {
  const positions = useMemo<[number, number, number][]>(() => {
    return agents.map((_, i) => {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const jitterX = ((i * 37) % 10) / 10 - 0.5;
      const jitterZ = ((i * 53) % 10) / 10 - 0.5;
      return [(col - GRID_COLS / 2) * CELL + jitterX, 0, row * CELL + jitterZ];
    });
  }, [agents]);

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 10, 4]} intensity={1.1} castShadow />
      <fog attach="fog" args={["#07080b", 12, 30]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 2]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#0c0e13" />
      </mesh>
      {agents.map((record, i) => (
        <Tree key={record.agent.id} record={record} position={positions[i]} onHover={onHover} />
      ))}
      <OrbitControls enablePan={false} minDistance={4} maxDistance={22} maxPolarAngle={Math.PI / 2.1} />
    </>
  );
}

export function AgentGrove({ agents }: { agents: AgentPortalRecord[] }) {
  const [hoverRecord, setHoverRecord] = useState<AgentPortalRecord | null>(null);

  const totals = useMemo(() => {
    const verified = agents.reduce((s, a) => s + a.verified, 0);
    const attempted = agents.reduce((s, a) => s + a.attempted, 0);
    const rejected = agents.reduce((s, a) => s + a.rejected, 0);
    return { verified, attempted, rejected };
  }, [agents]);

  if (agents.length === 0) {
    return (
      <div className="rounded-[30px] border border-dashed border-white/[0.08] bg-[#0a0d12] p-10 text-center text-sm text-[#737c89]">
        No agents registered yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[30px] border border-white/[0.07] bg-[#090b10] shadow-[0_30px_80px_rgba(0,0,0,.35)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-5 py-3 text-xs text-[#8a93a1]">
        <span className="font-medium text-[#ebe6dd]">The Grove</span>
        <span>
          {agents.length} agents · {totals.attempted} proofs · {totals.verified} verified · {totals.rejected} rejected
        </span>
      </div>
      <div className="relative h-[460px] w-full">
        <Canvas shadows camera={{ position: [7, 6, 11], fov: 42 }}>
          <Scene agents={agents} onHover={setHoverRecord} />
        </Canvas>
        {hoverRecord && (
          <div className="pointer-events-none absolute left-4 top-4 rounded-xl border border-white/[0.1] bg-[#0b0d12]/95 px-3.5 py-2.5 text-xs shadow-[0_8px_24px_rgba(0,0,0,.5)]">
            <div className="font-medium text-[#f1ecdf]">@{hoverRecord.agent.handle}</div>
            <div className="mt-1 text-[#8a93a1]">
              {hoverRecord.dominantCategory ? categoryLabel(hoverRecord.dominantCategory) : "Unproven"} · {hoverRecord.verified}/{hoverRecord.attempted} verified
            </div>
            <div className="mt-0.5 text-[#636b78]">{hoverRecord.ageDays}d identity · click to open Passport</div>
          </div>
        )}
        <div className="pointer-events-none absolute bottom-3 right-4 text-[10px] uppercase tracking-[.1em] text-[#555d69]">drag to rotate</div>
      </div>
    </div>
  );
}
