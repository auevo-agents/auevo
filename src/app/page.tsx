import Link from "next/link";
import { redirect } from "next/navigation";
import { GeoBanner } from "./geo-banner";
import { Disclaimer } from "./disclaimer";
import { LandingOrbit } from "./landing-orbit";
import { LandingHeaderWave } from "./landing-header-wave";
import { LandingTicker } from "./landing-ticker";
import { LandingCards } from "./landing-cards";
import { LandingNav } from "./landing-nav";
import { PublicQuotesTicker } from "./landing-public-quotes";
import { LandingFlow } from "./landing-flow";
import { Counter } from "./landing-counter";
import { Reveal } from "./landing-reveal";
import { BrandIcon } from "./brand-icon";
import { AuevoLogo } from "./auevo-logo";
import { getSupabaseServer } from "@/lib/supabase";
import { loadTickerTokens } from "@/lib/rwa/scanner-data";
import { fetchPublicQuotes, type PublicQuote } from "@/lib/rwa/public-quotes";
import { buildPremiumRows, sortByAbsPremium } from "@/lib/rwa/scanner";
import { sortAssetSummaries, type AssetSummary } from "@/lib/rwa/catalog";
import { LIFI_EVM_CHAINS, isSupportedLifiChain } from "@/lib/rwa/lifi/chains";

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
      issuerLabels: {} as Record<string, string>,
      publicQuotes,
      chainsDiscoveredCount: 0,
      chainsComingSoonCount: 0,
    };
  }

  const [{ premiumRows, mostAvailable, chainsDiscoveredCount, chainsComingSoonCount }, issuerRecords] = await Promise.all([
    (async () => {
      try {
        const { summaries } = await loadTickerTokens(supabase);
        // Real chain diversity the registry has actually found tokens on —
        // separate from LIFI_EVM_CHAINS (what Swap & Bridge can route
        // between today). The registry regularly finds a tokenized asset
        // on a chain before that chain has a trading route, so this is
        // never smaller than the "supported" count and is the honest
        // "how many networks, really" figure rather than the routing
        // list's own size.
        const discoveredChainIds = new Set(summaries.flatMap((s) => s.tokens.map((t) => t.chainId)));
        return {
          premiumRows: sortByAbsPremium(buildPremiumRows(summaries)),
          // Falls back to this when nothing has a priced premium yet (an
          // early registry, or the price cron hasn't caught up) — real
          // issuer/chain counts instead of an empty section, never a
          // fabricated price. See the "Live from the scanner" section below.
          mostAvailable: sortAssetSummaries(summaries, "most_available").filter((a) => a.tokenCount > 0),
          chainsDiscoveredCount: discoveredChainIds.size,
          chainsComingSoonCount: [...discoveredChainIds].filter((id) => !isSupportedLifiChain(id)).length,
        };
      } catch {
        return {
          premiumRows: [] as ReturnType<typeof buildPremiumRows>,
          mostAvailable: [] as AssetSummary[],
          chainsDiscoveredCount: 0,
          chainsComingSoonCount: 0,
        };
      }
    })(),
    (async () => {
      try {
        const { data } = await supabase.from("rwa_issuers").select("id, name");
        return data ?? [];
      } catch {
        return [] as { id: string; name: string }[];
      }
    })(),
  ]);

  return {
    premiumRows,
    mostAvailable,
    issuerNames: issuerRecords.map((issuer) => issuer.name),
    issuerLabels: Object.fromEntries(issuerRecords.map((issuer) => [issuer.id, issuer.name])),
    publicQuotes,
    chainsDiscoveredCount,
    chainsComingSoonCount,
  };
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
    scene: "assets",
    body: "Every tokenized stock and ETF this app's registry has found, across every issuer and chain, with live premium and risk score.",
    tag: "Live · Robinhood Chain",
    href: "/app/assets",
    mockup: "chips",
  },
  {
    num: "02",
    title: "Scanner",
    scene: "scanner",
    body: "Premium, arbitrage, contract risk, liquidity depth and new listings — ranked, not just listed.",
    tag: "6 tabs",
    href: "/app/scanner",
    mockup: "compare",
  },
  {
    num: "03",
    title: "Baskets",
    scene: "baskets",
    body: "Buy 5–10 stocks in one wallet signature through Uniswap v4 — no N-signature flow.",
    tag: "One signature",
    href: "/app/baskets",
    mockup: "checklist",
  },
  {
    num: "04",
    title: "Pools",
    scene: "pools",
    body: "v4 RWA/USDG pools on Robinhood Chain — liquidity, 24h volume and fee APR.",
    tag: "Uniswap v4",
    href: "/app/pools",
    mockup: "apr",
  },
  {
    num: "05",
    title: "Swap & Bridge",
    scene: "bridge",
    body: "Trade on Robinhood Chain, or bridge tokenized assets in from five other chains via LI.FI.",
    tag: "Best route",
    href: "/app/swap",
    mockup: "compare",
  },
  {
    num: "06",
    title: "Alerts",
    scene: "alerts",
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
    scene: "compare",
    body: "See how the same tokenized stock compares across every issuer that's tokenized it — price, chain, verification, side by side.",
    tag: "Every issuer, one view",
    href: "/app/assets",
    mockup: "chips",
  },
  {
    num: "B",
    title: "Verify",
    scene: "verify",
    body: "A contract risk score before you trade — mint, pause, blacklist, freeze and upgradeability, checked directly from the deployed bytecode, not a claim.",
    tag: "Risk, not a black box",
    href: "/app/scanner",
    mockup: "risk",
  },
  {
    num: "C",
    title: "Trade",
    scene: "trade",
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

  const { premiumRows, mostAvailable, issuerNames, issuerLabels, publicQuotes, chainsComingSoonCount } = await loadLandingData();
  const tickerRows = premiumRows.map((r) => ({ ticker: r.ticker, priceUsd: r.priceUsd, premiumBps: r.premiumBps! }));
  const liveTops = premiumRows.slice(0, LIVE_TOPS_LIMIT);
  const chainNames = LIFI_EVM_CHAINS.map((c) => c.chain.name);

  return (
    <main className="landing2 landing2-premium">
      <header className="landing-header">
        <LandingHeaderWave />
        <Link href="/" className="landing-brand" aria-label="Auevo home">
          <AuevoLogo />
        </Link>
        <LandingNav />
      </header>

      <section className="landing2-hero landing2-hero-premium">
        <div className="landing2-hero-grid">
          <div className="landing2-hero-content">
            <p className="landing2-eyebrow">The platform for tokenized markets</p>
            <h1 className="landing2-h1">
              One platform for
              <br />
              <em>everything</em> tokenized.
            </h1>
            <p className="landing2-hero-copy">
              Search every tokenized stock, ETF, treasury, commodity and credit claim.
              Compare issuers, check contract risk, trade in one signature, earn on pools
              and baskets, track your portfolio — all without leaving Auevo.
            </p>
            <div className="landing2-cta-row">
              <Link href="/app/assets" className="landing2-cta">
                Explore markets
              </Link>
              <Link href="/app/scanner" className="landing2-cta-link">
                Open scanner
              </Link>
            </div>
            <p className="landing-status">
              Built on verifiable on-chain data.{" "}
              <Link href="/docs">See how Auevo works</Link>
            </p>
            <GeoBanner />
          </div>
          <LandingOrbit />
        </div>
      </section>

      <div className="landing2-market-tapes">
        <LandingTicker rows={tickerRows} />
        <PublicQuotesTicker quotes={publicQuotes} />
      </div>

      <Reveal>
        <section className="landing2-section landing2-scanner-section">
          <div className="landing2-section-heading">
            <div>
              <p className="landing2-section-label">01 / The scanner</p>
              <h2 className="landing2-section-title">
                One asset. Every issuer. <em>Every signal.</em>
              </h2>
            </div>
            <Link href="/app/scanner" className="landing2-text-link">
              Explore the scanner
            </Link>
          </div>

          {liveTops.length > 0 ? (
            <>
              <div className="landing2-scanner-table" role="table" aria-label="Live tokenized asset premiums">
                <div className="landing2-scanner-head" role="row">
                  <span>Asset</span>
                  <span>Issuer / chain</span>
                  <span>Token price</span>
                  <span>Premium / discount</span>
                  <span>Contract risk</span>
                </div>
                {liveTops.map((row) => {
                  const premium = formatPremium(row.premiumBps!);
                  const chain = LIFI_EVM_CHAINS.find((c) => c.chain.id === row.chainId)?.chain.name ?? "On-chain";
                  return (
                    <Link
                      key={`${row.chainId}:${row.address}`}
                      href={`/app/assets/${row.ticker}`}
                      className="landing2-scanner-row"
                      role="row"
                    >
                      <span className="landing2-scanner-asset">
                        <BrandIcon symbol={row.ticker} name={row.name} kind="ticker" size={36} />
                        <span><b>{row.ticker}</b><small>{row.name}</small></span>
                      </span>
                      <span className="landing2-scanner-issuer">
                        <b>{issuerLabels[row.issuerId] ?? "Verified issuer"}</b><small>{chain}</small>
                      </span>
                      <span className="landing2-scanner-price">{formatUsd(row.priceUsd)}</span>
                      <span className={`landing2-scanner-premium ${premium.className}`}>
                        <i aria-hidden="true" />{premium.text}
                      </span>
                      <span className="landing2-scanner-risk">
                        {row.riskScore == null ? <span className="landing2-risk-pending">Pending</span> : <><b>{row.riskScore}</b><small>Risk score</small></>}
                      </span>
                    </Link>
                  );
                })}
              </div>
              <p className="landing2-data-note">Live token prices and premiums from the Auevo scanner. Contract risk appears when verified data is available.</p>
            </>
          ) : mostAvailable.length > 0 ? (
            <>
              <div className="landing2-scanner-table landing2-scanner-table-fallback" role="table" aria-label="Assets in the Auevo registry">
                <div className="landing2-scanner-head" role="row">
                  <span>Asset</span><span>Verified issuers</span><span>Chains</span><span>Availability</span><span />
                </div>
                {mostAvailable.slice(0, LIVE_TOPS_LIMIT).map((asset) => (
                  <Link key={asset.ticker} href={`/app/assets/${asset.ticker}`} className="landing2-scanner-row" role="row">
                    <span className="landing2-scanner-asset">
                      <BrandIcon symbol={asset.ticker} name={asset.name} kind="ticker" size={36} />
                      <span><b>{asset.ticker}</b><small>{asset.name}</small></span>
                    </span>
                    <span className="landing2-scanner-issuer"><b>{asset.issuerCount}</b><small>Verified issuers</small></span>
                    <span className="landing2-scanner-issuer"><b>{asset.chainCount}</b><small>Supported chains</small></span>
                    <span className="landing2-scanner-live"><i />In registry</span>
                  </Link>
                ))}
              </div>
              <p className="landing2-data-note">Premium comparisons appear when both token and reference market prices are available.</p>
            </>
          ) : (
            <div className="landing2-scanner-empty">
              <span className="landing2-empty-mark">A</span>
              <p>The scanner is preparing its first market snapshot.</p>
              <Link href="/app/scanner">Open the scanner</Link>
            </div>
          )}
        </section>
      </Reveal>

      <Reveal>
        <section className="landing2-section landing2-compare-section">
          <div className="landing2-section-heading">
            <div>
              <p className="landing2-section-label">02 / Compare · verify · trade</p>
              <h2 className="landing2-section-title">Three checks before a trade.</h2>
            </div>
          </div>
          <LandingCards cards={TRIPTYCH_CARDS} tickers={tickerRows.map((r) => r.ticker)} />
        </section>
      </Reveal>

      <Reveal>
        <section className="landing2-section landing2-flow-section">
          <div className="landing2-section-heading">
            <div>
              <p className="landing2-section-label">03 / The path to your wallet</p>
              <h2 className="landing2-section-title">From issuer to wallet, with every step in view.</h2>
            </div>
          </div>
          <LandingFlow />
        </section>
      </Reveal>

      <Reveal>
        <section className="landing2-section landing2-tools-section">
          <div className="landing2-section-heading">
            <div>
              <p className="landing2-section-label">04 / The workspace</p>
              <h2 className="landing2-section-title">A complete toolkit for on-chain markets.</h2>
            </div>
            <Link href="/app" className="landing2-text-link">
              Open workspace
            </Link>
          </div>
          <LandingCards cards={FEATURE_CARDS} tickers={tickerRows.map((r) => r.ticker)} />
        </section>
      </Reveal>

      <Reveal>
        <section className="landing2-section landing2-stats-section">
          <p className="landing2-section-label">05 / The registry</p>
          <h2 className="landing2-section-title">A growing market, mapped on-chain.</h2>
          <div className="landing2-stats">
            <div className="landing2-stat">
              <span className="landing2-stat-value"><Counter value={issuerNames.length} /></span>
              <span className="landing2-stat-label">Issuers tracked</span>
            </div>
            <div className="landing2-stat">
              <span className="landing2-stat-value"><Counter value={chainNames.length} /></span>
              <span className="landing2-stat-label">Chains supported</span>
              {chainsComingSoonCount > 0 && (
                <span className="landing2-stat-note">+{chainsComingSoonCount} more found — coming soon</span>
              )}
            </div>
            <div className="landing2-stat">
              <span className="landing2-stat-value"><Counter value={1} /></span>
              <span className="landing2-stat-label">Signature per basket trade</span>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="landing2-band landing2-band-premium">
          <p className="landing2-section-label">A clearer view of tokenized markets</p>
          <h2>See what stands <em>behind the ticker.</em></h2>
          <p>Explore the registry, compare issuers and check the route before you trade.</p>
          <Link href="/app/scanner" className="landing2-cta">
            Open the scanner
          </Link>
        </section>
      </Reveal>

      <footer className="landing2-footer">
        <div className="landing2-footer-row">
          <AuevoLogo />
          <nav className="landing2-footer-links" aria-label="Legal and social">
            <Link href="/privacy" className="landing2-footer-link">
              Privacy
            </Link>
            <Link href="/policy" className="landing2-footer-link">
              Policy
            </Link>
            <a
              href="https://x.com/Auevotrade"
              target="_blank"
              rel="noreferrer"
              className="landing2-footer-link"
            >
              X
            </a>
          </nav>
        </div>
        <Disclaimer />
      </footer>
    </main>
  );
}
