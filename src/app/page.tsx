import Link from "next/link";
import { redirect } from "next/navigation";
import { GeoBanner } from "./geo-banner";
import { Disclaimer } from "./disclaimer";
import { LandingOrbit } from "./landing-orbit";
import { LandingTicker } from "./landing-ticker";
import { LandingCards } from "./landing-cards";
import { LandingNav } from "./landing-nav";
import { PartnerRow } from "./landing-partners";
import { LandingFlow } from "./landing-flow";
import { Counter } from "./landing-counter";
import { Reveal } from "./landing-reveal";
import { BrandIcon } from "./brand-icon";
import { getSupabaseServer } from "@/lib/supabase";
import { loadTickerTokens } from "@/lib/rwa/scanner-data";
import { buildPremiumRows, sortByAbsPremium } from "@/lib/rwa/scanner";
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
  if (!supabase) return { premiumRows: [] as ReturnType<typeof buildPremiumRows>, issuerNames: [] as string[] };

  const [premiumRows, issuerNames] = await Promise.all([
    (async () => {
      try {
        const { summaries } = await loadTickerTokens(supabase);
        return sortByAbsPremium(buildPremiumRows(summaries));
      } catch {
        return [] as ReturnType<typeof buildPremiumRows>;
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

  return { premiumRows, issuerNames };
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

export default async function Home({ searchParams }: PageProps<"/">) {
  const { wallet } = await searchParams;
  const address = Array.isArray(wallet) ? wallet[0] : wallet;

  if (address) {
    redirect(`/legacy/fees?wallet=${encodeURIComponent(address)}`);
  }

  const { premiumRows, issuerNames } = await loadLandingData();
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
      <PartnerRow
        items={[
          ...issuerNames.map((name) => ({ name, kind: "issuer" as const })),
          ...chainNames.map((name) => ({ name, kind: "chain" as const })),
        ]}
      />

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
          <p className="landing2-section-label">02 / The workspace</p>
          <h2 className="landing2-section-title">Six tools, one wallet.</h2>
          <LandingCards cards={FEATURE_CARDS} tickers={tickerRows.map((r) => r.ticker)} />
        </section>
      </Reveal>

      <Reveal>
        <section className="landing2-section">
          <p className="landing2-section-label">03 / By the numbers</p>
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
          <p className="landing2-section-label">04 / How it flows</p>
          <h2 className="landing2-section-title">From issuer to your wallet, in one pass.</h2>
          <LandingFlow />
        </section>
      </Reveal>

      {liveTops.length > 0 && (
        <Reveal>
          <section className="landing2-section">
            <p className="landing2-section-label">05 / Live from the scanner</p>
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
