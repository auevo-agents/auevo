/**
 * A second (and third) running line beyond the price ticker — real
 * issuer names (rwa_issuers) and real supported chains (lifi/chains.ts),
 * not decoration text, each looping via the same duplicated-content +
 * CSS-translateX trick as LandingTicker so no JS is needed to animate it.
 */
export function LandingMarquee({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
  if (items.length === 0) return null;

  return (
    <div className="landing2-marquee">
      <div className={reverse ? "landing2-marquee-track landing2-marquee-reverse" : "landing2-marquee-track"}>
        {[0, 1].map((copy) => (
          <span className="landing2-marquee-set" key={copy}>
            {items.map((item, i) => (
              <span className="landing2-marquee-item" key={`${item}-${i}`}>
                {item}
                <span className="landing2-marquee-dot">◆</span>
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}
