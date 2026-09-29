import Image from "next/image";

type MarkProps = {
  className?: string;
  title?: string;
};

type LogoProps = MarkProps & {
  compact?: boolean;
};

/** The selected Auevo mark: a dimensional A wrapped by a routing orbit. */
export function AuevoMark({ className = "", title }: MarkProps) {
  return (
    <Image
      src="/images/auevo-mark.png"
      width={48}
      height={48}
      className={`auevo-mark ${className}`.trim()}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      draggable={false}
    />
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
