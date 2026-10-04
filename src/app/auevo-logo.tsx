type MarkProps = {
  className?: string;
  title?: string;
};

type LogoProps = MarkProps & {
  compact?: boolean;
};

export function AuevoMark({ className = "", title }: MarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={`auevo-mark ${className}`.trim()}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id="au-tree-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe7aa" />
          <stop offset="48%" stopColor="#d7b56d" />
          <stop offset="100%" stopColor="#8b6429" />
        </linearGradient>
        <linearGradient id="au-tree-green" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#93ebbd" />
          <stop offset="100%" stopColor="#2c8f62" />
        </linearGradient>
        <filter id="au-tree-glow">
          <feGaussianBlur stdDeviation="1.1" result="b" />
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      <g fill="none" stroke="url(#au-tree-gold)" strokeLinecap="round" strokeLinejoin="round" filter="url(#au-tree-glow)">
        <path d="M32 55V16" strokeWidth="3"/>
        <path d="M32 35C24 34 19 29 16 22" strokeWidth="2.5"/>
        <path d="M32 40C42 39 47 32 50 24" strokeWidth="2.5"/>
        <path d="M32 28C38 27 42 23 45 18" strokeWidth="2"/>
        <path d="M32 31C26 30 22 25 20 20" strokeWidth="2"/>
      </g>
      <g fill="url(#au-tree-green)" stroke="url(#au-tree-gold)" strokeWidth=".8">
        <path d="M13 19c7-3 13 0 14 7-7 1-12-1-14-7Z"/>
        <path d="M44 14c6-1 11 2 11 8-6 0-10-2-11-8Z"/>
        <path d="M47 23c7-1 12 3 12 9-7 0-11-3-12-9Z"/>
        <path d="M16 28c7-1 12 3 12 9-7 0-11-3-12-9Z"/>
      </g>
      <path d="M27 55h10" stroke="url(#au-tree-gold)" strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M32 13l2.2 4.2L38.5 19l-4.3 1.8L32 25l-2.2-4.2L25.5 19l4.3-1.8Z" fill="#f3d58c" filter="url(#au-tree-glow)"/>
    </svg>
  );
}

export function AuevoLogo({ className = "", compact = false, title = "Auevo" }: LogoProps) {
  return (
    <span className={`auevo-logo ${compact ? "auevo-logo-compact" : ""} ${className}`.trim()}>
      <AuevoMark />
      {!compact && (
        <span className="auevo-wordmark auevo-wordmark-gold" aria-label={title}>
          AUEVO
        </span>
      )}
    </span>
  );
}
