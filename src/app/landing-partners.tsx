import { BrandIcon } from "./brand-icon";

export interface PartnerItem {
  name: string;
  kind: "issuer" | "chain";
}

/**
 * A clean, static row of real partner/issuer/chain names — a real
 * official brand mark (brand-icon.tsx) where one is available, else a
 * monogram avatar, plus the name, wrapped in a pill. The scrolling-
 * marquee treatment reads as filler once you have a name list this
 * short; a wrapped static row (HyperDex's own "Integration Partners" /
 * Assets-page issuer row) reads as a credible, deliberate list instead.
 */
export function PartnerRow({ items }: { items: PartnerItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="landing2-partners">
      {items.map((item) => (
        <span className="landing2-partner-chip" key={item.name}>
          <BrandIcon symbol={item.name} kind={item.kind} size={22} />
          {item.name}
        </span>
      ))}
    </div>
  );
}
