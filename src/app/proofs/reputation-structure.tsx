import type { CategoryAggregate } from "@/lib/auevo/score";
import type { ProofCategory } from "@/lib/auevo/db";

const CATEGORY_ORDER: ProofCategory[] = [
  "identity",
  "skill",
  "work",
  "performance",
  "economic_activity",
  "financial_performance",
  "prediction",
  "autonomy",
  "longevity",
];

const CATEGORY_LABEL: Record<ProofCategory, string> = {
  identity: "Identity",
  skill: "Skill",
  work: "Work",
  performance: "Performance",
  economic_activity: "Economic",
  financial_performance: "Financial",
  prediction: "Prediction",
  autonomy: "Autonomy",
  longevity: "Longevity",
};

const CATEGORY_ACCENT: Record<ProofCategory, string> = {
  identity: "#c7ccd6",
  skill: "#8b72ff",
  work: "#52b9d8",
  performance: "#b28cff",
  economic_activity: "#4fc6a4",
  financial_performance: "#d6ae61",
  prediction: "#846bff",
  autonomy: "#54c8a5",
  longevity: "#b8a98c",
};

const CONFIDENCE_WEIGHT: Record<string, number> = {
  DETERMINISTICALLY_VERIFIED: 1,
  ORACLE_VERIFIED: 0.9,
  MULTI_VALIDATOR_VERIFIED: 0.82,
  COUNTERPARTY_CONFIRMED: 0.6,
  SELF_REPORTED: 0.3,
  INSUFFICIENT: 0.12,
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function volume(attempted: number) {
  return clamp(Math.log1p(attempted) / Math.log(101));
}

function trendFor(category: CategoryAggregate) {
  if (category.median === null || category.best === null || category.worst === null) return 0;
  const spread = Math.abs(category.best - category.worst);
  if (spread < 0.0001) return 0;

  // For prediction error, lower is better. For financial alpha, higher is better.
  const directionalMedian =
    category.category === "prediction"
      ? (category.worst - category.median) / spread
      : (category.median - category.worst) / spread;

  return clamp(directionalMedian * 2 - 1, -1, 1);
}

function trendStroke(trend: number) {
  if (trend > 0.18) return "#d6ae61";
  if (trend < -0.18) return "#ff5d72";
  return "#6f7890";
}

export interface ReputationStructureProps {
  categories: CategoryAggregate[];
  ageDays: number;
  compact?: boolean;
  showLabels?: boolean;
  className?: string;
}

export function ReputationStructure({
  categories,
  ageDays,
  compact = false,
  showLabels = false,
  className = "",
}: ReputationStructureProps) {
  const byCategory = new Map(categories.map((c) => [c.category as ProofCategory, c]));
  const data = CATEGORY_ORDER.map((category) => {
    const aggregate = byCategory.get(category);
    const attempted = aggregate?.attempted ?? 0;
    const verified = aggregate?.verified ?? 0;
    const verifiedRatio = attempted > 0 ? verified / attempted : 0;
    const depth = volume(attempted);
    const confidence = CONFIDENCE_WEIGHT[aggregate?.confidence ?? "INSUFFICIENT"] ?? 0.12;
    return {
      category,
      aggregate,
      attempted,
      verified,
      verifiedRatio,
      depth,
      confidence,
      trend: aggregate ? trendFor(aggregate) : 0,
    };
  });

  const ringCount = Math.max(1, Math.min(10, Math.ceil(Math.max(ageDays, 1) / 45)));
  const viewBox = compact ? "0 0 260 260" : "0 0 520 420";
  const centerX = compact ? 130 : 260;
  const centerY = compact ? 130 : 202;
  const baseRadius = compact ? 33 : 66;
  const maxHeight = compact ? 62 : 124;
  const minHeight = compact ? 13 : 25;
  const coreRadius = compact ? 16 : 29;

  return (
    <svg
      viewBox={viewBox}
      className={`block h-auto w-full ${className}`}
      role="img"
      aria-label="AUEVO reputation structure generated from live proof data"
    >
      <defs>
        <radialGradient id={compact ? "au-core-mini" : "au-core"} cx="42%" cy="36%" r="72%">
          <stop offset="0%" stopColor="#d8bc82" stopOpacity=".95" />
          <stop offset="45%" stopColor="#8b72ff" stopOpacity=".78" />
          <stop offset="100%" stopColor="#101522" stopOpacity=".18" />
        </radialGradient>
        <filter id={compact ? "au-glow-mini" : "au-glow"}>
          <feGaussianBlur stdDeviation={compact ? "2.6" : "4"} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g opacity=".72">
        {Array.from({ length: ringCount }).map((_, index) => {
          const radius = baseRadius + 15 + index * (compact ? 6.7 : 12);
          return (
            <circle
              key={radius}
              cx={centerX}
              cy={centerY}
              r={radius}
              fill="none"
              stroke={index === ringCount - 1 ? "#5c536f" : "#283044"}
              strokeOpacity={index === ringCount - 1 ? ".48" : ".32"}
              strokeWidth={compact ? ".7" : "1"}
              strokeDasharray={index % 2 ? "2 6" : undefined}
            />
          );
        })}
      </g>

      <g>
        {data.map((item, index) => {
          const angle = (index / CATEGORY_ORDER.length) * Math.PI * 2 - Math.PI / 2;
          const height = minHeight + maxHeight * item.depth;
          const width = (compact ? 8 : 13) + (compact ? 12 : 23) * item.depth;
          const startRadius = baseRadius;
          const endRadius = startRadius + height;
          const ux = Math.cos(angle);
          const uy = Math.sin(angle);
          const px = -uy;
          const py = ux;

          const baseLeft = [centerX + ux * startRadius + px * width / 2, centerY + uy * startRadius + py * width / 2];
          const baseRight = [centerX + ux * startRadius - px * width / 2, centerY + uy * startRadius - py * width / 2];
          const tipWidth = Math.max(2.5, width * 0.28);
          const tipLeft = [centerX + ux * endRadius + px * tipWidth / 2, centerY + uy * endRadius + py * tipWidth / 2];
          const tipRight = [centerX + ux * endRadius - px * tipWidth / 2, centerY + uy * endRadius - py * tipWidth / 2];

          const fillEndRadius = startRadius + height * item.verifiedRatio;
          const fillLeft = [centerX + ux * fillEndRadius + px * tipWidth / 2, centerY + uy * fillEndRadius + py * tipWidth / 2];
          const fillRight = [centerX + ux * fillEndRadius - px * tipWidth / 2, centerY + uy * fillEndRadius - py * tipWidth / 2];

          const failures = Math.max(0, item.attempted - item.verified);
          const fractureCount = Math.min(3, Math.ceil((failures / Math.max(1, item.attempted)) * 4));
          const opacity = 0.25 + item.confidence * 0.75;
          const labelRadius = endRadius + (compact ? 11 : 23);

          return (
            <g key={item.category}>
              <polygon
                points={[baseLeft, baseRight, tipRight, tipLeft].map((p) => p.join(",")).join(" ")}
                fill={CATEGORY_ACCENT[item.category]}
                fillOpacity={0.05 + item.confidence * 0.08}
                stroke={trendStroke(item.trend)}
                strokeWidth={compact ? "1" : "1.8"}
                strokeOpacity={opacity}
              />
              {item.verified > 0 && (
                <polygon
                  points={[baseLeft, baseRight, fillRight, fillLeft].map((p) => p.join(",")).join(" ")}
                  fill={CATEGORY_ACCENT[item.category]}
                  fillOpacity={0.23 + item.confidence * 0.52}
                  filter={item.confidence > 0.8 ? `url(#${compact ? "au-glow-mini" : "au-glow"})` : undefined}
                />
              )}

              {Array.from({ length: fractureCount }).map((_, fractureIndex) => {
                const fractureRadius = startRadius + height * (0.28 + fractureIndex * 0.18);
                const fx = centerX + ux * fractureRadius;
                const fy = centerY + uy * fractureRadius;
                const fractureHalf = width * 0.6;
                return (
                  <line
                    key={fractureIndex}
                    x1={fx + px * fractureHalf}
                    y1={fy + py * fractureHalf}
                    x2={fx - px * fractureHalf}
                    y2={fy - py * fractureHalf}
                    stroke="#ff5d72"
                    strokeWidth={compact ? ".8" : "1.35"}
                    strokeOpacity=".82"
                  />
                );
              })}

              {!compact && showLabels && (
                <>
                  <text
                    x={centerX + ux * labelRadius}
                    y={centerY + uy * labelRadius}
                    textAnchor={Math.abs(ux) < 0.2 ? "middle" : ux > 0 ? "start" : "end"}
                    dominantBaseline="middle"
                    fill="#8f98a9"
                    fontSize="10"
                    letterSpacing=".05em"
                  >
                    {CATEGORY_LABEL[item.category]}
                  </text>
                  {item.attempted > 0 && (
                    <text
                      x={centerX + ux * (labelRadius + (Math.abs(uy) > 0.75 ? 12 : 0))}
                      y={centerY + uy * (labelRadius + (Math.abs(uy) > 0.75 ? 12 : 0)) + 13}
                      textAnchor={Math.abs(ux) < 0.2 ? "middle" : ux > 0 ? "start" : "end"}
                      fill="#5f6879"
                      fontSize="9"
                    >
                      {item.verified}/{item.attempted}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </g>

      <g>
        <circle cx={centerX} cy={centerY} r={coreRadius + 9} fill="#0b1019" stroke="#2a3344" strokeWidth="1" />
        <circle
          cx={centerX}
          cy={centerY}
          r={coreRadius}
          fill={`url(#${compact ? "au-core-mini" : "au-core"})`}
          stroke="#c8ad78"
          strokeOpacity=".5"
          strokeWidth={compact ? "1" : "1.4"}
        />
        <circle cx={centerX} cy={centerY} r={compact ? 4 : 7} fill="#f0d59c" opacity=".95" />
      </g>
    </svg>
  );
}

export function categoryLabel(category: ProofCategory) {
  return CATEGORY_LABEL[category];
}

export function categoryAccent(category: ProofCategory) {
  return CATEGORY_ACCENT[category];
}

export { CATEGORY_ORDER };
