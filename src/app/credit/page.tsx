import Link from "next/link";
import { formatUnits } from "viem";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { getCreditPoolAddress, readPoolParams, readPoolLedger, readAssetDecimals } from "@/lib/credit/contract";
import { PortalFooter } from "@/app/portal-footer";
import { CrystalMotif } from "@/app/crystal-motif";
import { CreditSubnav } from "./credit-subnav";
import { RegisterForCreditPanel } from "./register-panel";
import { LenderPanel } from "./agent/credit-agent-actions";
import { InfoTip } from "@/app/info-tip";
import { WrongNetworkBanner } from "./wrong-network-banner";

export const revalidate = 60;

export default async function CreditLandingPage() {
  const pool = getCreditPoolAddress();
  const deployed = Boolean(pool);
  const params = deployed ? await readPoolParams() : null;
  const [ledger, assetDecimals] = deployed ? await Promise.all([readPoolLedger(), readAssetDecimals()]) : [null, null];

  const usdg = (v: bigint) => (assetDecimals !== null ? `${formatUnits(v, assetDecimals)} USDG` : `${v} (raw units)`);
  const rows = [
    ["Loan size", params ? `${usdg(params.minLoan)} – ${usdg(params.maxLoan)}` : "—"],
    ["Fee", params ? `${Number(params.feeBps) / 100}% per 30 days` : "—"],
    ["Min stake to become a backer or lender", params ? usdg(params.minRootStake) : "—"],
    ["Asset", params?.asset ?? "—"],
    ["Pool contract", params?.pool ?? "—"],
  ] as const;

  return (
    <div className="portal-page">
      <AgentPortalHeader active="credit" />
      <main className="portal-shell mx-auto max-w-[1500px] px-5 pb-20 pt-8 sm:px-8">
        <CreditSubnav active="pool" />
        <div className="credit-intro">
          <div className="portal-kicker">Agent credit protocol</div>
          <h1 className="portal-heading mt-4 text-5xl sm:text-6xl">Credit for AI agents</h1>
          <p className="portal-copy mt-5 max-w-3xl">
            Agents borrow stablecoins, backed by people who believe in them. Every line has a real third-party backer. Repayments
            are recorded on chain; the backer&apos;s stake pays first if an agent defaults.
          </p>
        </div>

        {pool && (
          <div className="mt-10">
            <h2 className="font-serif text-2xl text-[var(--ink)]">Get your agent its first line</h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
              Three steps. 1 and 2 you can do right here, right now, with no one else involved. 3 needs a second person (the
              agent owner&apos;s consent) — browse to a specific agent&apos;s own page to actually do it.
            </p>

            <WrongNetworkBanner />

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <PathCard n="01" title="Get a credit id" blurb="One free transaction (just gas). Needed before anything else — backing, borrowing, repaying all key off this id." href="#step-1" />
              <PathCard n="02" title="Fund the pool" blurb="Deposit USDG, earn 60% of every fee pool-wide as a passive lender. No agent id needed for this one." href="#step-2" />
              <PathCard n="03" title="Back a specific agent" blurb="Needs that agent's own id and its owner's signed consent — done from the agent's own page, not here." href="/credit/agents" />
            </div>

            <div id="step-1" className="mt-8 scroll-mt-24">
              <StepHeader n="1" title="Get a credit agent id" hint="Free — just network gas, no USDG moves. Mints the number every other step keys off." />
              <RegisterForCreditPanel pool={pool} />
            </div>

            {assetDecimals !== null && (
              <div id="step-2" className="mt-6 scroll-mt-24">
                <StepHeader n="2" title="Fund the pool (optional)" hint="Real USDG moves here. Skip this if you only came to register an agent id." />
                <LenderPanel pool={pool} assetDecimals={assetDecimals} />
              </div>
            )}

            <div className="mt-6">
              <StepHeader n="3" title="Back or borrow for a specific agent" hint="Vouching needs that agent's id and its owner's signed consent; borrowing needs an open line. Both happen on that agent's own page." />
              <div className="rounded-[3px] border border-[var(--line)] bg-[var(--panel)] p-4">
                <p className="text-xs text-[var(--muted)]">
                  Browse agents that already have a credit id, or paste one you already have into &quot;Check an agent&quot;
                  below — its own page has the vouch, borrow and repay forms.
                </p>
                {/* Inline color, not the text-[var(--bg)] utility: a site-wide unlayered `a{color:inherit}`
                    reset beats ANY layered Tailwind text-color utility on an <a>, regardless of specificity
                    (unlayered CSS always wins over layered CSS) — that's how this rendered invisible before,
                    cream text on its own cream background. An inline style is the one thing that reliably beats it. */}
                <Link href="/credit/agents" className="mt-3 inline-block rounded bg-[var(--ink)] px-4 py-2 text-sm" style={{ color: "var(--bg)" }}>
                  Browse agents →
                </Link>
              </div>
            </div>
          </div>
        )}

        {ledger && (
          <div className="mt-10 rounded-[3px] border border-[var(--line)] bg-[var(--panel-2)] p-5">
            <h3 className="flex items-center text-sm font-medium text-[var(--muted)]">
              Live ledger
              <InfoTip text="Read straight from the pool contract, live — not cached, not self-reported. This is the whole real usage of the pool right now, good or bad." />
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <LedgerStat label="Agents registered" value={ledger.agentsRegistered} />
              <LedgerStat label="Loans written" value={ledger.loansWritten} />
              <LedgerStat label="Loans repaid" value={ledger.loansRepaid} />
              <LedgerStat label="Loans open" value={ledger.loansOpen} />
              <LedgerStat label="Lender losses (bad debt)" value={ledger.totalBadDebt > 0n ? usdg(ledger.totalBadDebt) : "0"} warn={ledger.totalBadDebt > 0n} />
            </div>
            {ledger.loansWritten === 0 && (
              <p className="mt-3 text-xs text-[var(--muted)]">Zero loans so far — the pool is live, but nobody has actually used it yet. Be the first.</p>
            )}
          </div>
        )}

        <div className="credit-overview-grid mt-10">
          <section className="portal-panel p-6">
            <h2 className="font-serif text-2xl">How credit flows</h2>
            <div className="credit-schematic">
              {["Agent", "Backer", "Pool"].map((name, i) => (
                <div key={name}>
                  <CrystalMotif credit stage={i} />
                  <h3>{name}</h3>
                  <p>{["Borrows and repays", "Bears first loss", "Funds backed loans"][i]}</p>
                  {i < 2 && (
                    <span className="credit-arrow" aria-hidden="true">
                      →
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className="portal-copy text-sm">An unsecured loan for the agent. A funded commitment from the backer. A public record for everyone.</p>
            <Link href="/credit/protocol" className="mt-6 inline-block text-sm text-[#d7ba72]">
              Read the protocol →
            </Link>
          </section>
          <section className="portal-panel p-6">
            <h2 className="font-serif text-2xl">Live parameters</h2>
            <p className="mt-2 text-xs text-[#8ea699]">{!deployed ? "Awaiting deployment" : params ? "Read directly from the contract" : "Could not read parameters from the chain."}</p>
            <dl className="credit-parameters mt-5">
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <details className="mt-6 border-t border-white/10 pt-4 text-sm">
              <summary className="cursor-pointer text-[#d7ba72]">Technical details</summary>
              <div className="portal-copy mt-4 space-y-3 text-xs">
                <p>Modeled on an existing public unsecured-agent-lending design, independently implemented in <code>contracts/src/AgentCreditPool.sol</code>.</p>
                {!deployed && (
                  <>
                    <p>The contract is written and tested (29 integration tests). It is not deployed yet. Deployment is manual through <code>contracts/script/deploy-credit-pool.mjs</code>, using the deployer’s key and chosen identity registry.</p>
                    <p>Set <code>NEXT_PUBLIC_CREDIT_POOL_ADDRESS</code> after deployment to activate live parameters.</p>
                  </>
                )}
              </div>
            </details>
          </section>
          <section className="portal-panel p-6">
            <h2 className="font-serif text-2xl">Check an agent</h2>
            <p className="portal-copy mt-3 text-sm">Open a public credit record by on-chain ID or AUEVO handle. Either is enough.</p>
            <form action="/credit/agent" method="get" className="mt-6 grid gap-4">
              <label className="grid gap-2 text-xs text-[#a5b9ad]">
                On-chain agent ID
                <input name="id" placeholder="Enter agent ID" className="portal-input px-3 py-3 text-sm" />
              </label>
              <label className="grid gap-2 text-xs text-[#a5b9ad]">
                AUEVO handle
                <input name="handle" placeholder="Enter handle" className="portal-input px-3 py-3 text-sm" />
              </label>
              <button type="submit" className="portal-btn-primary justify-center py-3 text-sm">
                Open credit record →
              </button>
            </form>
            <div className="mt-6 space-y-3 border-t border-white/10 pt-5 text-xs">
              <p className="portal-copy">Free, public, no API key.</p>
              <Link href="/credit/protocol" className="block text-[#d7ba72]">
                Protocol →
              </Link>
              <Link href="/dev-log" className="block text-[#d7ba72]">
                Developer log →
              </Link>
            </div>
          </section>
        </div>

        <div className="mt-10">
          <h2 className="font-serif text-2xl text-[var(--ink)]">Good to know</h2>
          <div className="mt-4 divide-y divide-white/10 rounded-[3px] border border-[var(--line)]">
            <Faq q="Why does an agent need a backer at all?">
              The pool never lends against an agent&apos;s own word — it has no collateral and no credit history of its own
              yet. A backer is a real person or team staking real USDG that they lose first if the agent defaults. That stake
              is what makes the loan safe for lenders.
            </Faq>
            <Faq q="What does step 1 actually cost?">
              Just network gas — register() on the credit identity registry is a free function call, nothing is deposited or
              locked. The agent id it mints is what every later step (backing, borrowing, repaying) refers to.
            </Faq>
            <Faq q="Can I lose money as a lender?">
              Not from a default: every loan is backed dollar-for-dollar by its own sponsor&apos;s stake, and a default burns
              only that stake, never an uninvolved lender&apos;s deposit (see the <code className="rounded bg-[var(--panel-2)] px-1 py-0.5">totalBadDebt</code>{" "}
              figure in the live ledger above — it should stay at zero by construction; the{" "}
              <Link href="/credit/protocol" className="underline hover:text-[var(--ink)]">protocol page</Link> has the full
              invariant list). You can still lose by backing (vouching for) a specific agent that then defaults — that risk is
              yours alone, by design.
            </Faq>
            <Faq q="Does backing an agent get it a bigger line automatically later?">
              No automatic scoring yet. A line only grows when a backer vouches more, or a new backer joins. Once an agent has
              repaid enough loans it becomes eligible for a &quot;seat&quot; — an extra backing layer on top of ordinary USDG
              backing, see the <Link href="/credit/seats" className="underline hover:text-[var(--ink)]">Seats page</Link>.
            </Faq>
          </div>
        </div>
      </main>
      <PortalFooter />
    </div>
  );
}

function PathCard({ n, title, blurb, href }: { n: string; title: string; blurb: string; href: string }) {
  return (
    <Link href={href} className="group rounded-[3px] border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:border-[#d6ae61]/40">
      <div className="font-serif text-lg italic text-[#d6ae61]">{n}</div>
      <div className="mt-1 font-medium text-[var(--ink)]">{title}</div>
      <p className="mt-1.5 text-xs text-[var(--muted)]">{blurb}</p>
    </Link>
  );
}

function StepHeader({ n, title, hint }: { n: string; title: string; hint: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <span className="font-serif text-sm italic text-[#d6ae61]">Step {n}</span>
      <h3 className="font-medium text-[var(--ink)]">{title}</h3>
      <span className="text-xs text-[var(--muted)]">— {hint}</span>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm text-[var(--ink)]">
        {q}
        <span className="text-[var(--muted)] group-open:rotate-45">+</span>
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{children}</p>
    </details>
  );
}

function LedgerStat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className="rounded-[3px] border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[.08em] text-[var(--muted)]">{label}</div>
      <div className={`mt-1 font-mono text-lg ${warn ? "text-[var(--red)]" : "text-[var(--ink)]"}`}>{value}</div>
    </div>
  );
}
