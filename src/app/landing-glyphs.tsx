/**
 * Small original glyph marks for asset categories/concepts — used in the
 * hero's orbiting glass orbs and anywhere else this app labels an asset
 * class. Deliberately NOT real company/brand logos: reproducing Apple's,
 * Tesla's or any issuer's actual trademark without a licensed source
 * isn't something to fake, even hand-drawn to look similar. These are
 * plain, original geometric icons standing in for the category itself
 * (equities, ETFs, treasuries, issuers, chains) — the same category of
 * mark a legend or map key uses, not a copied identity.
 */

export function GlyphEquity({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <rect x="4" y="13" width="3.2" height="7" rx="0.6" fill="currentColor" />
      <rect x="10.4" y="8" width="3.2" height="12" rx="0.6" fill="currentColor" />
      <rect x="16.8" y="4" width="3.2" height="16" rx="0.6" fill="currentColor" />
    </svg>
  );
}

export function GlyphEtf({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="4" width="7" height="7" rx="1.2" />
      <rect x="13" y="4" width="7" height="7" rx="1.2" />
      <rect x="4" y="13" width="7" height="7" rx="1.2" />
      <rect x="13" y="13" width="7" height="7" rx="1.2" />
    </svg>
  );
}

export function GlyphTreasury({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 9l8-5 8 5" />
      <path d="M5 9v9M9.5 9v9M14.5 9v9M19 9v9" />
      <path d="M3 20h18" />
    </svg>
  );
}

export function GlyphIssuer({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="2.4" />
      <circle cx="5" cy="6" r="1.8" />
      <circle cx="19" cy="6" r="1.8" />
      <circle cx="5" cy="18" r="1.8" />
      <circle cx="19" cy="18" r="1.8" />
      <path d="M9.8 10.3 6.3 7.2M14.2 10.3l3.5-3.1M9.8 13.7l-3.5 3.1M14.2 13.7l3.5 3.1" />
    </svg>
  );
}

export function GlyphChain({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <rect x="3" y="8" width="8" height="8" rx="2.5" />
      <rect x="13" y="8" width="8" height="8" rx="2.5" />
      <path d="M11 12h2" />
    </svg>
  );
}

export function GlyphScan({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.3-4.3" />
    </svg>
  );
}
