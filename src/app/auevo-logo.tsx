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
      <img src="/images/auevo-tree-logo.svg" alt="" />
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
