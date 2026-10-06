import type { ProofEvent } from "@/lib/auevo/db";

/**
 * "Improvement history" (execution-plan doc §7) — the one return-to-the-
 * product feature the doc flags as cheapest to build: the data is
 * already in the Proof Timeline this renders beside, it just needed a
 * trend on top of it instead of only a flat list. Cumulative attempted
 * vs. verified (passed) over the agent's own chronological history —
 * same single-count axis for both lines (not a dual-axis chart), direct
 * end-labels instead of a legend box, same dark visual language as
 * ProofDNA.
 */
export function ProofGrowthTrend({ proofs, className = "" }: { proofs: ProofEvent[]; className?: string }) {
  const chronological = [...proofs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  if (chronological.length < 2) return null; // nothing to show a trend over yet

  let passedSoFar = 0;
  const points = chronological.map((p) => {
    if (p.status === "passed") passedSoFar++;
    return passedSoFar;
  });

  const width = 600;
  const height = 160;
  const padX = 28;
  const padY = 22;
  const n = points.length;
  const maxAttempted = n;
  const x = (i: number) => padX + (i / (n - 1)) * (width - padX * 2);
  const y = (v: number) => height - padY - (v / maxAttempted) * (height - padY * 2);

  const attemptedPath = Array.from({ length: n }, (_, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(i + 1)}`).join(" ");
  const passedPath = points.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
  const lastPassed = points[n - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={"block w-full h-auto " + className} role="img" aria-label={`Attempted ${n}, verified ${lastPassed}, over this agent's history`}>
      <rect width={width} height={height} rx="12" fill="#080b10" />
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={padX} x2={width - padX} y1={padY + f * (height - padY * 2)} y2={padY + f * (height - padY * 2)} stroke="#1c212b" strokeWidth="1" />
      ))}
      <path d={attemptedPath} fill="none" stroke="#5a6472" strokeWidth="2" strokeLinecap="round" />
      <path d={passedPath} fill="none" stroke="#42d995" strokeWidth="2" strokeLinecap="round" />
      <circle cx={x(n - 1)} cy={y(n)} r="3" fill="#5a6472" />
      <circle cx={x(n - 1)} cy={y(lastPassed)} r="3" fill="#42d995" />
      <text x={width - padX} y={Math.max(14, y(n) - 7)} textAnchor="end" fill="#8b94a1" fontSize="10">
        attempted {n}
      </text>
      <text x={width - padX} y={Math.min(height - 6, y(lastPassed) + 15)} textAnchor="end" fill="#8cf0bd" fontSize="10">
        verified {lastPassed}
      </text>
      <text x={padX} y="16" fill="#747d8a" fontSize="10" letterSpacing="1.5">
        GROWTH
      </text>
    </svg>
  );
}
