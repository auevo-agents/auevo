/**
 * A small "?" that explains the thing next to it on hover or keyboard
 * focus — pure CSS (see .info-tip* in portal-design.css), no JS state,
 * so it works immediately with no hydration delay and degrades to
 * "just a question mark" if CSS ever fails to load, never a layout
 * break. Use next to any label, field or badge whose meaning isn't
 * obvious from its own text — e.g. a field nobody explained before
 * (the "Create an agent" model picker) rather than ones that already
 * have inline prose doing the same job.
 */
export function InfoTip({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`info-tip ${className}`} tabIndex={0} role="button" aria-label={text}>
      <span aria-hidden="true">?</span>
      <span className="info-tip-bubble" role="tooltip">
        {text}
      </span>
    </span>
  );
}
