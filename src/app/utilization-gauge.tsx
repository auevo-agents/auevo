"use client";

/**
 * A semi-circle gauge showing how much of a lending reserve's supplied
 * liquidity is currently borrowed (totalBorrowUsd / totalSupplyUsd) — a
 * real, derivable stat, not a personal loan-to-value (this app runs no
 * lending contract of its own, so there's no wallet position to gauge;
 * see lend/page.tsx's own doc comment). Visual style only.
 */

const SIZE = { cx: 100, cy: 108, r: 82, strokeWidth: 14, viewW: 200, viewH: 128 };

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(startDeg: number, endDeg: number) {
  const { cx, cy, r } = SIZE;
  const start = polarToCartesian(cx, cy, r, startDeg);
  const end = polarToCartesian(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export function UtilizationGauge({ pct, gradientId }: { pct: number | null; gradientId: string }) {
  const clamped = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  const angle = 180 + clamped * 1.8;
  const marker = polarToCartesian(SIZE.cx, SIZE.cy, SIZE.r, angle);

  return (
    <div className="utilization-gauge">
      <svg viewBox={`0 0 ${SIZE.viewW} ${SIZE.viewH}`} className="utilization-gauge-svg">
        <defs>
          <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={SIZE.cx - SIZE.r} y1={SIZE.cy} x2={SIZE.cx + SIZE.r} y2={SIZE.cy}>
            <stop offset="0%" stopColor="#5ae09d" />
            <stop offset="55%" stopColor="var(--au-gold, #c9b27c)" />
            <stop offset="78%" stopColor="#e0a640" />
            <stop offset="100%" stopColor="#ff4259" />
          </linearGradient>
        </defs>
        <path d={describeArc(180, 360)} fill="none" stroke={`url(#${gradientId})`} strokeWidth={SIZE.strokeWidth} strokeLinecap="round" opacity={0.22} />
        {pct !== null && (
          <>
            <path d={describeArc(180, angle)} fill="none" stroke={`url(#${gradientId})`} strokeWidth={SIZE.strokeWidth} strokeLinecap="round" />
            <circle cx={marker.x} cy={marker.y} r={7} fill="#0d1215" stroke="#eef0ef" strokeWidth={2.5} />
          </>
        )}
      </svg>
      <div className="utilization-gauge-label">
        <b>{pct === null ? "—" : `${clamped.toFixed(0)}%`}</b>
        <small>utilization</small>
      </div>
    </div>
  );
}
