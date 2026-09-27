import Link from "next/link";
import { redirect } from "next/navigation";
import { GeoBanner } from "./geo-banner";
import { Disclaimer } from "./disclaimer";
import { LandingOrbit } from "./landing-orbit";
import { LandingTicker } from "./landing-ticker";
import { LandingCards } from "./landing-cards";
import { LandingNav } from "./landing-nav";
import { PublicQuotesTicker } from "./landing-public-quotes";
import { LandingFlow } from "./landing-flow";
import { Counter } from "./landing-counter";
import { Reveal } from "./landing-reveal";
import { BrandIcon } from "./brand-icon";
import { getSupabaseServer } from "@/lib/supabase";
import { loadTickerTokens } from "@/lib/rwa/scanner-data";
import { fetchPublicQuotes, type PublicQuote } from "@/lib/rwa/public-quotes";
import { buildPremiumRows, sortByAbsPremium } from "@/lib/rwa/scanner";
import { sortAssetSummaries, type AssetSummary } from "@/lib/rwa/catalog";
import { LIFI_EVM_CHAINS } from "@/lib/rwa/lifi/chains";

/**
 * RWA_SPEC.md section 6's landing page: "живые топы, сканер-превью (топ
 * премий/дисконтов), корзины, эмитенты" — the piece Phase 0 deliberately
 * deferred until the registry (Phase 1) and scanner (Phase 5) had real
 * data to show. Both exist now, so the ticker tape and "live tops" list
 * below read real premium data through the same lib/rwa/scanner.ts
 * assembly the Scanner page's own Premium tab uses — never a fabricated
 * number, and both sections simply render nothing if there's no priced
 * data yet (an empty registry is an honest, temporary state, not
 * something to paper over with placeholder figures).
 *
 * `?wallet=` is still honored for old shared links (auevo.io/?wallet=...
 * posted to X/Telegram before this rebuild) by forwarding to the fee
 * scanner's new home instead of dropping them on a landing page that
 * doesn't know what to do with the address.
 */

const LIVE_TOPS_LIMIT = 5;

async function loadLandingData() {
  const supabase = getSupabaseServer();
  const publicQuotes = await fetchPublicQuotes().catch(() => [] as PublicQuote[]);
  if (!supabase) {
    return {
      premiumRows: [] as ReturnType<typeof buildPremiumRows>,
      mostAvailable: [] as AssetSummary[],
      issuerNames: [] as string[],
      publicQuotes,
    };
  }

  const [{ premiumRows, mostAvailable }, issuerNames] = await Promise.all([
    (async () => {
      try {
        const { summaries } = await loadTickerTokens(supabase);
        return {
          premiumRows: sortByAbsPremium(buildPremiumRows(summaries)),
          // Falls back to this when nothing has a priced premium yet (an
          // early registry, or the price cron hasn't caught up) — real
          // issuer/chain counts instead of an empty section, never a
          // fabricated price. See the "Live from the scanner" section below.
          mostAvailable: sortAssetSummaries(summaries, "most_available").filter((a) => a.tokenCount > 0),
        };
      } catch {
        return { premiumRows: [] as ReturnType<typeof buildPremiumRows>, mostAvailable: [] as AssetSummary[] };
      }
    })(),
    (async () => {
      try {
        const { data } = await supabase.from("rwa_issuers").select("name");
        return (data ?? []).map((i) => i.name);
      } catch {
        return [] as string[];
      }
    })(),
  ]);

  return { premiumRows, mostAvailable, issuerNames, publicQuotes };
}

function formatUsd(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPremium(bps: number): { text: string; className: string } {
  const pct = bps / 100;
  const sign = pct >= 0 ? "+" : "";
  return { text: `${sign}${pct.toFixed(2)}%`, className: pct >= 0 ? "landing2-ticker-up" : "landing2-ticker-down" };
}

const FEATURE_CARDS = [
  {
    num: "01",
    title: "Assets",
    body: "Every tokenized stock and ETF this app's registry has found, across every issuer and chain, with live premium and risk score.",
    tag: "Live · Robinhood Chain",
    href: "/app/assets",
    mockup: "chips",
  },
  {
    num: "02",
    title: "Scanner",
    body: "Premium, arbitrage, contract risk, liquidity depth and new listings — ranked, not just listed.",
    tag: "6 tabs",
    href: "/app/scanner",
    mockup: "compare",
  },
  {
    num: "03",
    title: "Baskets",
    body: "Buy 5–10 stocks in one wallet signature through Uniswap v4 — no N-signature flow.",
    tag: "One signature",
    href: "/app/baskets",
    mockup: "checklist",
  },
  {
    num: "04",
    title: "Pools",
    body: "v4 RWA/USDG pools on Robinhood Chain — liquidity, 24h volume and fee APR.",
    tag: "Uniswap v4",
    href: "/app/pools",
    mockup: "apr",
  },
  {
    num: "05",
    title: "Swap & Bridge",
    body: "Trade on Robinhood Chain, or bridge tokenized assets in from five other chains via LI.FI.",
    tag: "Best route",
    href: "/app/swap",
    mockup: "compare",
  },
  {
    num: "06",
    title: "Alerts",
    body: "Premium above a threshold, a new listing, or a whale trade — delivered to the web or Telegram.",
    tag: "Web + Telegram",
    href: "/app/scanner",
    mockup: "alert",
  },
] as const;

const TRIPTYCH_CARDS = [
  {
    num: "A",
    title: "Compare",
    body: "See how the same tokenized stock compares across every issuer that's tokenized it — price, chain, verification, side by side.",
    tag: "Every issuer, one view",
    href: "/app/assets",
    mockup: "chips",
  },
  {
    num: "B",
    title: "Verify",
    body: "A contract risk score before you trade — mint, pause, blacklist, freeze and upgradeability, checked directly from the deployed bytecode, not a claim.",
    tag: "Risk, not a black box",
    href: "/app/scanner",
    mockup: "risk",
  },
  {
    num: "C",
    title: "Trade",
    body: "Route to whichever issuer/chain combination has the best price for your size on Robinhood Chain, or bridge a tokenized asset in from five other chains.",
    tag: "Best available route",
    href: "/app/swap",
    mockup: "compare",
  },
] as const;

export default async function Home({ searchParams }: PageProps<"/">) {
  const { wallet } = await searchParams;
  const address = Array.isArray(wallet) ? wallet[0] : wallet;

  if (address) {
    redirect(`/legacy/fees?wallet=${encodeURIComponent(address)}`);
  }

  const { premiumRows, mostAvailable, issuerNames, publicQuotes } = await loadLandingData();
  const tickerRows = premiumRows.map((r) => ({ ticker: r.ticker, priceUsd: r.priceUsd, premiumBps: r.premiumBps! }));
  const liveTops = premiumRows.slice(0, LIVE_TOPS_LIMIT);
  const chainNames = LIFI_EVM_CHAINS.map((c) => c.chain.name);

  return (
    <main className="landing2">
      <header className="landing-header">
        <Link href="/" className="landing-brand">
          auevo<span>_</span>
        </Link>
        <LandingNav />
      </header>

      <LandingTicker rows={tickerRows} />
      <PublicQuotesTicker quotes={publicQuotes} />

      <section className="landing2-hero">
        <div className="landing2-hero-grid">
          <div>
            <p className="landing2-eyebrow">Open market infrastructure for tokenized equities</p>
            <h1 className="landing2-h1">
              Every tokenized stock.
              <br />
              <em>Every issuer.</em> Scanned.
            </h1>
            <p className="landing2-hero-copy">
              A marketplace for tokenized real-world assets — stocks, ETFs, commodities,
              treasuries, private credit — across issuers and chains. Starting on Robinhood
              Chain, with a scanner for the premium or discount to the real asset, arbitrage
              between issuers, contract risk and liquidity depth that a plain marketplace
              doesn&apos;t show you.
            </p>
            <div className="landing2-cta-row">
              <Link href="/app/assets" className="landing2-cta">
                Browse assets →
              </Link>
              <Link href="/app" className="landing2-cta-link">
                Open workspace
              </Link>
            </div>
            <p className="landing-status">
              Under active construction — see the build in progress in the{" "}
              <Link href="/app">workspace</Link>.
            </p>
            <GeoBanner />
          </div>
          <LandingOrbit />
        </div>
      </section>

      <Reveal>
        <section className="landing2-section">
          <p className="landing2-section-label">01 / How it works</p>
          <h2 className="landing2-section-title">One registry. One scanner. One signature to trade.</h2>
          <div className="landing2-steps">
            <div className="landing2-step">
              <span className="landing2-step-num">01</span>
              <h3>Scan</h3>
              <p>
                Every tokenized stock across every issuer and chain, ranked by premium,
                arbitrage spread, contract risk and liquidity depth.
              </p>
              <span className="landing2-step-tag">Premium + risk + liquidity → one score</span>
            </div>
            <div className="landing2-step">
              <span className="landing2-step-num">02</span>
              <h3>Trade</h3>
              <p>
                One signature through Uniswap v4 on Robinhood Chain — single swaps, baskets of
                5–10 stocks, or bridge in from five other chains.
              </p>
              <span className="landing2-step-tag">UniversalRouter → one transaction</span>
            </div>
            <div className="landing2-step">
              <span className="landing2-step-num">03</span>
              <h3>Track</h3>
              <p>
                Your RWA portfolio in USD, alerts on premium spikes and new listings, delivered
                to the web or Telegram.
              </p>
              <span className="landing2-step-tag">Wallet → live alerts</span>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="landing2-section">
          <p className="landing2-section-label">02 / Compare, verify, trade</p>
          <h2 className="landing2-section-title">A tokenized stock is a claim, not the asset. Know the difference.</h2>
          <LandingCards cards={TRIPTYCH_CARDS} tickers={tickerRows.map((r) => r.ticker)} />
        </section>
      </Reveal>

      <Reveal>
        <section className="landing2-section">
          <p className="landing2-section-label">03 / The workspace</p>
          <h2 className="landing2-section-title">Six tools, one wallet.</h2>
          <LandingCards cards={FEATURE_CARDS} tickers={tickerRows.map((r) => r.ticker)} />
        </section>
      </Reveal>

      <Reveal>
        <section className="landing2-section">
          <p className="landing2-section-label">04 / By the numbers</p>
          <h2 className="landing2-section-title">Every issuer, every chain, one registry.</h2>
          <div className="landing2-stats">
            <div className="landing2-stat">
              <span className="landing2-stat-value">
                <Counter value={issuerNames.length} />
              </span>
              <span className="landing2-stat-label">Issuers tracked</span>
            </div>
            <div className="landing2-stat">
              <span className="landing2-stat-value">
                <Counter value={chainNames.length} />
              </span>
              <span className="landing2-stat-label">Chains supported</span>
            </div>
            <div className="landing2-stat">
              <span className="landing2-stat-value">
                <Counter value={1} />
              </span>
              <span className="landing2-stat-label">Signature per basket trade</span>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="landing2-section">
          <p className="landing2-section-label">05 / How it flows</p>
          <h2 className="landing2-section-title">From issuer to your wallet, in one pass.</h2>
          <LandingFlow />
        </section>
      </Reveal>

      {liveTops.length > 0 ? (
        <Reveal>
          <section className="landing2-section">
            <p className="landing2-section-label">06 / Live from the scanner</p>
            <h2 className="landing2-section-title">Today&apos;s biggest premiums and discounts.</h2>
            <div className="landing2-tops">
              {liveTops.map((row) => {
                const premium = formatPremium(row.premiumBps!);
                return (
                  <Link key={`${row.chainId}:${row.address}`} href={`/app/assets/${row.ticker}`} className="landing2-tops-row">
                    <b style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <BrandIcon symbol={row.ticker} name={row.name} kind="ticker" size={22} />
                      {row.ticker}
                    </b>
                    <span className="landing2-tops-name">{row.name}</span>
                    <span className="landing2-tops-price">{formatUsd(row.priceUsd)}</span>
                    <span className={`landing2-tops-premium ${premium.className}`}>{premium.text}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        </Reveal>
      ) : (
        mostAvailable.length > 0 && (
          <Reveal>
            <section className="landing2-section">
              <p className="landing2-section-label">06 / Live from the registry</p>
              <h2 className="landing2-section-title">Most available right now, across every issuer and chain.</h2>
              <div className="landing2-tops">
                {mostAvailable.slice(0, LIVE_TOPS_LIMIT).map((asset) => (
                  <Link key={asset.ticker} href={`/app/assets/${asset.ticker}`} className="landing2-tops-row">
                    <b style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <BrandIcon symbol={asset.ticker} name={asset.name} kind="ticker" size={22} />
                      {asset.ticker}
                    </b>
                    <span className="landing2-tops-name">{asset.name}</span>
                    <span className="landing2-tops-price">
                      {asset.issuerCount} issuer{asset.issuerCount === 1 ? "" : "s"}
                    </span>
                    <span className="landing2-tops-premium">
                      {asset.chainCount} chain{asset.chainCount === 1 ? "" : "s"}
                    </span>
                  </Link>
                ))}
              </div>
              <p className="desk-note" style={{ marginTop: 4 }}>
                Premium needs a priced pool on both sides to compute — shown here by how many issuers/chains the
                registry has verified it on instead, until that catches up.
              </p>
            </section>
          </Reveal>
        )
      )}

      <Reveal>
        <section className="landing2-band">
          <h2>
            Built for people who actually check <em>the premium.</em>
          </h2>
          <Link href="/app/scanner" className="landing2-cta">
            Open the scanner →
          </Link>
        </section>
      </Reveal>

      <footer className="landing2-footer">
        <Disclaimer />
      </footer>
    </main>
  );
}
