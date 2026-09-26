const AVATAR_COLORS = ["#ff344d", "#5ae09d", "#f5a623", "#6ea8fe", "#c77dff", "#ff8a5c"];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/**
 * A clean, static row of real partner/issuer names — a monogram avatar
 * (no real logo files to embed) plus the name, wrapped in a pill. The
 * scrolling-marquee treatment reads as filler once you have a name list
 * this short; a wrapped static row (HyperDex's own "Integration
 * Partners" / Assets-page issuer row) reads as a credible, deliberate
 * list instead.
 */
export function PartnerRow({ items }: { items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div className="landing2-partners">
      {items.map((name) => (
        <span className="landing2-partner-chip" key={name}>
          <span className="landing2-partner-avatar" style={{ background: colorFor(name) }}>
            {name.charAt(0).toUpperCase()}
          </span>
          {name}
        </span>
      ))}
    </div>
  );
}
