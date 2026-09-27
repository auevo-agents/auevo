type MarkProps = {
  className?: string;
  title?: string;
};

type LogoProps = MarkProps & {
  compact?: boolean;
};

/**
 * Auevo's product mark: an editorial A crossed by an orbital market route.
 * The node represents the verified asset; the orbit is the path across
 * issuer, chain and venue. Pure SVG keeps the mark sharp inside dense
 * workspace navigation and documentation chrome.
 */
export function AuevoMark({ className = "", title }: MarkProps) {
  return (
    <svg
      className={`auevo-mark ${className}`.trim()}
      viewBox="0 0 48 48"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path
        className="auevo-mark-a"
        fillRule="evenodd"
        d="M22.35 4.5h3.5L42 42h-8.15l-3.26-8.15H17.5L14.25 42H6L22.35 4.5Zm1.82 12.18-4.1 10.37h8.08l-3.98-10.37Z"
      />
      <path
        className="auevo-mark-orbit"
        d="M4.6 31.2c5.35 5.1 17.45 6.25 28.2 1.05 7.2-3.5 11.58-8.88 9.77-12.03-1.38-2.41-6.4-2.24-12.07-.1"
      />
      <circle className="auevo-mark-node" cx="41.1" cy="20.45" r="3.05" />
    </svg>
  );
}

export function AuevoLogo({ className = "", compact = false, title = "Auevo" }: LogoProps) {
  return (
    <span className={`auevo-logo ${compact ? "auevo-logo-compact" : ""} ${className}`.trim()}>
      <AuevoMark />
      {!compact && (
        <span className="auevo-wordmark" aria-label={title}>
          auevo
        </span>
      )}
    </span>
  );
}
