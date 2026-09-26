import Link from "next/link";
import { redirect } from "next/navigation";
import { GeoBanner } from "./geo-banner";
import { Disclaimer } from "./disclaimer";

/**
 * Temporary landing page for the RWA marketplace + scanner rebuild (see
 * docs/RWA_SPEC.md, phase 0: "/` больше не редиректит на /fees —
 * временный лендинг"). The real landing (live tops, scanner preview,
 * baskets, issuers — RWA_SPEC.md section 6) needs the registry (Phase 1)
 * and scanner (Phase 5) to have anything real to show; this is a
 * placeholder until then, not the final page.
 *
 * `?wallet=` is still honored for old shared links (auevo.io/?wallet=...
 * posted to X/Telegram before this rebuild) by forwarding to the fee
 * scanner's new home instead of dropping them on a landing page that
 * doesn't know what to do with the address.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const { wallet } = await searchParams;
  const address = Array.isArray(wallet) ? wallet[0] : wallet;

  if (address) {
    redirect(`/legacy/fees?wallet=${encodeURIComponent(address)}`);
  }

  return (
    <main className="landing">
      <header className="landing-header">
        <Link href="/" className="landing-brand">
          auevo<span>_</span>
        </Link>
        <Link href="/app" className="landing-cta-ghost">
          Open workspace →
        </Link>
      </header>

      <section className="landing-hero">
        <h1>Every tokenized stock. Every issuer. Scanned.</h1>
        <p>
          A marketplace for tokenized real-world assets — stocks, ETFs,
          commodities, treasuries, private credit — across issuers and
          chains. Starting on Robinhood Chain, with a scanner for the
          premium or discount to the real asset, arbitrage between
          issuers, contract risk and liquidity depth that a plain
          marketplace doesn&apos;t show you.
        </p>

        <div className="landing-cta-row">
          <Link href="/app/assets" className="landing-cta">
            Browse assets →
          </Link>
          <Link href="/app" className="landing-cta-ghost">
            Open workspace
          </Link>
        </div>

        <p className="landing-status">
          Under active construction — see the build in progress in the{" "}
          <Link href="/app">workspace</Link>.
        </p>

        <GeoBanner />
      </section>

      <footer className="landing-footer">
        <Disclaimer />
      </footer>
    </main>
  );
}
