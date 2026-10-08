type MarkProps = {
  className?: string;
  title?: string;
};

type LogoProps = MarkProps & {
  compact?: boolean;
};

export function AuevoMark({ className = "", title }: MarkProps) {
  return (
    <span
      className={`auevo-tree-mark ${className}`.trim()}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="auevoTreeGold" x1="14" y1="8" x2="48" y2="56" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F3DA9A"/>
            <stop offset=".58" stopColor="#D7B56D"/>
            <stop offset="1" stopColor="#A6782E"/>
          </linearGradient>
          <linearGradient id="auevoTreeGreen" x1="17" y1="9" x2="45" y2="49" gradientUnits="userSpaceOnUse">
            <stop stopColor="#89E3AF"/>
            <stop offset=".56" stopColor="#2C9F68"/>
            <stop offset="1" stopColor="#0C4B32"/>
          </linearGradient>
        </defs>
        <g shapeRendering="crispEdges">
          <path d="M29 10h6v8h7v7h6v7h-8v6h-6v16h-4V38h-7v-6h-8v-7h7v-7h7v-8Z" fill="url(#auevoTreeGreen)"/>
          <path d="M31 18h3v8h4v7h-4v7h-3v10h-3V40h-4v-7h4v-7h3v-8Z" fill="url(#auevoTreeGold)" opacity=".95"/>
          <rect x="19" y="23" width="5" height="5" rx="1" fill="#E8C873"/>
          <rect x="41" y="22" width="5" height="5" rx="1" fill="#E8C873"/>
          <rect x="14" y="30" width="5" height="5" rx="1" fill="#E8C873"/>
          <rect x="45" y="31" width="5" height="5" rx="1" fill="#E8C873"/>
          <path d="M25 50h14v5H25z" fill="#143B2A"/>
          <path d="M21 55h22v3H21z" fill="url(#auevoTreeGold)" opacity=".9"/>
        </g>
      </svg>
    </span>
  );
}

export function AuevoLogo({ className = "", compact = false, title = "Auevo" }: LogoProps) {
  if (compact) return <AuevoMark className={className} title={title} />;
  return (
    <span className={`auevo-logo auevo-logo-tree ${className}`.trim()}>
      <AuevoMark />
      <span className="auevo-wordmark auevo-wordmark-gold" aria-label={title}>AUEVO</span>
    </span>
  );
}
