/**
 * Decorative hero illustration — a dotted cluster with two rotating
 * elliptical rings (CSS keyframes, see .landing2-orbit-ring-1/2 in
 * globals.css), in the spirit of code.markets' own orbit/atom diagrams.
 * Pure decoration, no data behind it — dot positions are a fixed,
 * deterministic grid (not Math.random(), which would differ between the
 * server render and any client re-render).
 */
function dotGrid(): { x: number; y: number; r: number }[] {
  const dots: { x: number; y: number; r: number }[] = [];
  const cx = 100;
  const cy = 100;
  const rx = 62;
  const ry = 72;
  const step = 9;
  for (let y = cy - ry; y <= cy + ry; y += step) {
    for (let x = cx - rx; x <= cx + rx; x += step) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        dots.push({ x, y, r: 1.1 });
      }
    }
  }
  return dots;
}

const DOTS = dotGrid();
const NODES = [
  { x: 38, y: 60 },
  { x: 168, y: 48 },
  { x: 26, y: 132 },
  { x: 176, y: 140 },
];

export function LandingOrbit() {
  return (
    <div className="landing2-orbit" aria-hidden="true">
      <svg viewBox="0 0 200 200" fill="none">
        {DOTS.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} className="landing2-orbit-dots" />
        ))}
        <ellipse
          className="landing2-orbit-ring landing2-orbit-ring-1"
          cx="100"
          cy="100"
          rx="94"
          ry="34"
          style={{ transformBox: "fill-box" }}
        />
        <ellipse
          className="landing2-orbit-ring landing2-orbit-ring-2"
          cx="100"
          cy="100"
          rx="34"
          ry="94"
          style={{ transformBox: "fill-box" }}
        />
        {NODES.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r="2.4" className="landing2-orbit-node" />
        ))}
      </svg>
    </div>
  );
}
