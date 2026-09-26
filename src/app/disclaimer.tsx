/**
 * Standing disclaimer for anything that shows a tokenized real-world
 * asset's price, premium, or a way to trade it — RWA_SPEC.md section 4
 * requires this on every asset page; it's a shared component so that
 * requirement is one line to add anywhere, not copy-pasted text that
 * drifts. `compact` drops it to a single line for tight layouts (e.g. a
 * swap card footer) instead of the full paragraph.
 */
export function Disclaimer({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="rwa-disclaimer rwa-disclaimer-compact">
        Not investment advice. Tokenized assets track, but are not, the
        underlying security — see the issuer&apos;s own terms.
      </p>
    );
  }

  return (
    <p className="rwa-disclaimer">
      This is not investment advice. A tokenized stock, ETF or other
      real-world-asset token is a claim issued by a third party (see its
      issuer) that tracks the price of the underlying asset — it is not
      the underlying security itself, does not carry shareholder rights
      unless the issuer says otherwise, and can trade at a premium or
      discount to the real asset. Auevo does not issue, custody, or
      guarantee any of these tokens; verify an issuer&apos;s own terms and
      backing disclosures before trading.
    </p>
  );
}
