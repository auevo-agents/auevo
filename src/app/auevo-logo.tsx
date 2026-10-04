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
        <linearGradient id="au-logo-violet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#b9f6d5" />
          <stop offset="52%" stopColor="#42d995" />
          <stop offset="100%" stopColor="#1f8f61" />
        </linearGradient>
        <linearGradient id="au-logo-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe2a4" />
          <stop offset="55%" stopColor="#d6ae61" />
          <stop offset="100%" stopColor="#9c7430" />
        </linearGradient>
        <filter id="au-logo-glow">
          <feGaussianBlur stdDeviation="1.35" result="b" />
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      <g fill="#07140e" stroke="#244c38" strokeWidth="1">
        <path d="M12 48 32 57 52 48 32 39Z" />
        <path d="M16 40 32 47 48 40 32 33Z" />
      </g>

      <g strokeLinejoin="round">
        <path d="M25 43V24l7-4 7 4v19l-7 4Z" fill="#0f2419" stroke="#2d5a43"/>
        <path d="M20 45V33l5-3 5 3v12l-5 3Z" fill="#0b1c14" stroke="#28513d"/>
        <path d="M39 45V31l5-3 5 3v14l-5 3Z" fill="#0b1c14" stroke="#28513d"/>
        <path d="M28 24V14l4-2.5 4 2.5v10l-4 2.5Z" fill="url(#au-logo-violet)" stroke="#d1f8e3" filter="url(#au-logo-glow)"/>
        <path d="M17 37h3M44 36h4M30 35h4M30 40h4" stroke="url(#au-logo-gold)" strokeWidth="2" strokeLinecap="round" filter="url(#au-logo-glow)"/>
        <path d="M32 11.5V6.5" stroke="#5be0a0" strokeWidth="1.6" strokeLinecap="round" filter="url(#au-logo-glow)"/>
        <circle cx="32" cy="5.5" r="1.2" fill="#f2db9b" filter="url(#au-logo-glow)"/>
      </g>
    </svg>
  );
}

export function AuevoLogo({ className = "", compact = false, title = "Auevo" }: LogoProps) {
  return (
    <span className={`auevo-logo ${compact ? "auevo-logo-compact" : ""} ${className}`.trim()}>
      <AuevoMark />
      {!compact && (
        <span className="auevo-wordmark" aria-label={title}>
          AUEVO
        </span>
      )}
    </span>
  );
}
