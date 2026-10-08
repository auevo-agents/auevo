import { formatUnits } from "viem";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { CreditSubnav } from "../credit-subnav";
import { ProtocolSubnav } from "./protocol-subnav";
import { getCreditPoolAddress, readPoolParams, readSeatConfig, readAssetDecimals } from "@/lib/credit/contract";
import { PortalFooter } from "@/app/portal-footer";

export const revalidate = 60;

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-[3px] border border-[var(--line)] bg-[var(--panel-2)] p-4 text-[11px] leading-relaxed text-[var(--muted)]">
      <code>{children}</code>
    </pre>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-10 first:mt-0">
      <div className="text-xs tracking-[.1em] text-[#d6ae61]">§ {n}</div>
      <h2 className="portal-heading mt-1 text-2xl">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

/**
 * The detailed "how the pool works" writeup for AgentCreditPool.sol,
 * grounded in the actual contract source rather than restated from
 * memory. Deploy-time parameters are read live from the pool; everything
 * else (the model, the lifecycle, the constants) is static documentation
 * of the contract itself, kept in sync by hand when the Solidity changes
 * — same convention as contracts/README.md.
 */
export default async function CreditProtocolPage() {
  const pool = getCreditPoolAddress();
  const params = pool ? await readPoolParams() : null;
  const seatConfig = await readSeatConfig();
  const assetDecimals = pool ? await readAssetDecimals() : null;
  const usdg = (v: bigint) => (assetDecimals !== null ? `${formatUnits(v, assetDecimals)} USDG` : `${v} (raw units)`);

  return (
    <div className="portal-page">
      <AgentPortalHeader active="credit" />

      <section className="portal-shell relative mx-auto max-w-[1100px] px-5 pt-14 pb-20 sm:px-8">
        <CreditSubnav active="protocol" />
        <ProtocolSubnav />

        <h1 className="portal-heading text-4xl sm:text-5xl">
          How the pool <em className="text-[#8fc9a6] not-italic">works</em>, in full.
        </h1>
        <p className="mt-4 text-[var(--muted)] leading-relaxed">
          The model, what a default does, the invariants and every parameter of AgentCreditPool — read live from the
          contract on Robinhood Chain where a value is deploy-time, documented from its own source where it isn&apos;t.
          Full source: <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">contracts/src/AgentCreditPool.sol</code>.
        </p>

        <Section n="01" title="Model">
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            One pool of USDG. An agent&apos;s line can be backed by up to 20 distinct sponsors at once, each at its
            own premium, plus any number of seats (see § 03) on top. If a loan defaults, the loss is burned only from
            the pool-shares of the sponsors who actually backed <em>that</em> loan — never a lender&apos;s, and never
            a sponsor who backed a different agent or joined this one after the default.
          </p>
          <Code>{`backing(r)   = sharesValue(r)                     // r's own pool shares, in USDG
free(r)      = backing(r) - delegatedOut(r) - feeLocked(r)
available(a) = delegatedIn(a) - principalOut(a)    // what's left on agent a's line

vouch(r -> a, amount):   require amount <= free(r)  // + the owner's EIP-712 consent, see below
                         delegatedOut(r) += amount ;  delegatedIn(a) += amount

borrow(a, amount, term): require minLoan <= amount <= available(a)
                         principalOut(a) += amount
                         // amount splits pro-rata across a's CURRENT sponsors, by stake.amount;
                         // each sponsor's own fee share is frozen into loan.shares[] right here
                         feeLocked(sponsor) += its share of the fee

repay(a, principal+fee): fee -> lenders 60% + each sponsor 25% (its own cut) + reserve 15%`}</Code>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <RoleCard title="lender">
              Deposits USDG, holds pool shares, earns 60% of every fee. Every line is backed by a sponsor&apos;s own
              locked shares, and a default burns those — not a lender&apos;s principal, by construction.
            </RoleCard>
            <RoleCard title="sponsor">
              Vouches USDG capacity for one agent, from its own deposited pool shares, with the agent owner&apos;s
              signed consent. Earns 25% of that agent&apos;s fees; risks exactly what it vouched, only on a loan it
              actually backed.
            </RoleCard>
            <RoleCard title="agent">
              An identity (ERC-8004-shaped). Borrows $5–$500 for 1–30 days at 1%/30d within the line its sponsors
              vouched. Its own owner or configured operatorWallet can borrow; anyone can repay on its behalf.
            </RoleCard>
            <RoleCard title="reserve">
              Takes 15% of every base fee, paid out immediately on repay — never accrues in the contract itself. No
              owner, no admin function anywhere in this contract to redirect it.
            </RoleCard>
          </div>
        </Section>

        <Section n="02" title="Loan lifecycle and what a default does">
          <p className="text-sm text-[var(--muted)] leading-relaxed">Four transitions. The last one is a default, where the backing sponsors pay.</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[3px] border border-[var(--line)] bg-[var(--panel-2)] p-4 text-xs text-[var(--muted)]">
              <div className="mb-2 font-mono text-[10px] text-[var(--muted)]">loan.status</div>
              <div className="flex flex-col gap-2">
                <StateRow from="Open" to="Repaid" via="repay() before markDefault()" />
                <StateRow from="Open" to="Defaulted" via="dueAt + 3d grace passed, anyone calls markDefault()" />
                <StateRow from="Repaid agent" to="Open" via="borrow() again — same line, same sponsors" />
              </div>
              <p className="mt-3">
                repay → agent&apos;s record grows (loansRepaid, volumeRepaid); the line stays as-is.
                <br />
                default → agent is permanently defaulted, can never borrow again; the owner&apos;s default count
                records it.
              </p>
            </div>
            <Code>{`require now > loan.defaultableAt          // dueAt + GRACE_PERIOD(3d), fixed at borrow

for each SponsorShare in loan.shares:
  burn ceil[(principal+fee) * totalShares / totalAssets] of that sponsor's own shares
  // if its live stake somehow falls short (should be unreachable — vouch()/
  // borrow() only ever check freeCapacity at that moment), the shortfall
  // becomes explicit totalBadDebt instead of diluting anyone else

for every sponsor of this agent (used by this loan or not):
  release its full remaining committed capacity — the agent can never
  borrow again, so nothing should stay locked against it

agent.defaulted = true ;  agent.delegatedIn = 0
share price: never falls for an uninvolved lender or sponsor`}</Code>
          </div>
        </Section>

        <Section n="03" title="Seats">
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            A seat backs an agent with 10 or more repaid loans using a fixed-ratio lock of a separate token (intended
            to be $AUEVO), <strong className="text-[var(--ink)]">on top of</strong> the same real-USDG capacity an
            ordinary vouch requires — never instead of it. The reasoning for that ordering (why burning an unrelated
            token alone can never protect a lender) is laid out in full on the{" "}
            <a href="/credit/seats" className="underline hover:text-[var(--ink)]">
              Seats page
            </a>
            . Short version: 50% of the seat&apos;s token lock burns on default of the loan it backed; the rest
            returns, same as an ordinary sponsor&apos;s pool-share burn running alongside it.
          </p>
        </Section>

        <Section n="04" title="Invariants">
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            Reviewed by hand and exercised by 118 integration-test assertions against a local chain (
            <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">contracts/test/run-credit.mjs</code>) —{" "}
            <strong className="text-[var(--ink)]">not</strong> an automated invariant fuzzer, and not a paid,
            independent, professional audit. Treat these as intended properties the tests check, not a guarantee.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <InvariantCard id="I1 · solvency">
              totalBadDebt stays 0 and share price never falls, except through the explicit, visible backstop path —
              no loan loss reaches an uninvolved lender.
            </InvariantCard>
            <InvariantCard id="I2 · exposure">
              For every agent, principalOut ≤ delegatedIn. For every sponsor, delegatedOut ≤ its own pool-share value
              at the moment of any vouch or borrow — checked on-chain, not assumed.
            </InvariantCard>
            <InvariantCard id="I3 · isolation">
              A default burns only the shares (and, for a seat, the token lock) of sponsors who backed that specific
              loan — never a different agent&apos;s sponsor, never a sponsor who joined after that loan was drawn.
            </InvariantCard>
          </div>
        </Section>

        <Section n="05" title="Parameters">
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            The first table is read live from the deployed pool — a real decision made at deploy time, not a code
            detail. The second is fixed in the contract source itself and identical for any deployment of this
            version.
          </p>

          {!pool ? (
            <p className="mt-3 text-sm text-[var(--muted)]">Not deployed yet — nothing to read live.</p>
          ) : params ? (
            <div className="mt-3 overflow-x-auto rounded-[3px] border border-[var(--line)]">
              <table className="w-full text-sm">
                <tbody>
                  <ParamRow name="minLoan / maxLoan" value={`${usdg(params.minLoan)} – ${usdg(params.maxLoan)}`} meaning="smallest / largest loan" />
                  <ParamRow name="feeBps" value={`${Number(params.feeBps) / 100}% per 30 days`} meaning="base fee, pro-rata by term" />
                  <ParamRow name="minRootStake" value={usdg(params.minRootStake)} meaning="to enroll as a root (sponsor or lender)" />
                  <ParamRow name="asset" value={params.asset} meaning="the stablecoin agents borrow and repay in" mono />
                  <ParamRow name="pool" value={params.pool} meaning="this contract's own address" mono />
                  {seatConfig.deployed && seatConfig.supported && (
                    <>
                      <ParamRow
                        name="seatToken"
                        value={seatConfig.enabled ? seatConfig.seatToken : "disabled (address(0))"}
                        meaning="the ERC-20 a seat locks — intended to be $AUEVO"
                        mono
                      />
                      {seatConfig.enabled && (
                        <ParamRow
                          name="seat ratio"
                          value={`${seatConfig.ratioNumerator.toString()} / ${seatConfig.ratioDenominator.toString()}`}
                          meaning="seat-token units locked per USDG unit vouched (fixed, not a live price)"
                        />
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--muted)]">Could not read pool parameters from the chain.</p>
          )}

          <div className="mt-4 overflow-x-auto rounded-[3px] border border-[var(--line)]">
            <table className="w-full text-sm">
              <tbody>
                <ParamRow name="LENDER_FEE_BPS / SPONSOR_FEE_BPS" value="60% / 25%" meaning="of each fee; the remainder (15%) goes to the reserve" />
                <ParamRow name="MAX_PREMIUM_BPS" value="2% per 30 days" meaning="ceiling a sponsor's own premium can ever reach" />
                <ParamRow name="GRACE_PERIOD" value="3 days" meaning="after dueAt before markDefault() is allowed" />
                <ParamRow name="MIN_TERM_DAYS / MAX_TERM_DAYS" value="1 / 30" meaning="loan duration bounds" />
                <ParamRow name="MAX_SPONSORS_PER_AGENT" value="20" meaning="caps the per-agent loop in borrow()/repay()/markDefault() — bounds gas, not a design preference" />
                <ParamRow name="SEAT_MIN_REPAID_LOANS" value="10" meaning="repaid loans an agent needs before a seat can back it" />
                <ParamRow name="SEAT_BURN_BPS" value="50%" meaning="of a seat's token lock burned on default of the loan it backed" />
              </tbody>
            </table>
          </div>
        </Section>

        <Section n="06" title="Interface">
          <p className="text-sm text-[var(--muted)] leading-relaxed">Every write a lender, sponsor, seat-holder or agent can call, plus the views this app&apos;s own pages read from.</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-[3px] border border-[var(--line)]">
              <table className="w-full text-xs">
                <tbody>
                  <FnRow sig="deposit(uint256 amount)" who="lender" />
                  <FnRow sig="withdraw(uint256 amount)" who="lender" />
                  <FnRow sig="enrollRoot()" who="sponsor/seat-holder" />
                  <FnRow sig="vouch(agentId, amount, premiumBps, maxPremiumBps, nonce, deadline, sig)" who="sponsor" />
                  <FnRow sig="vouchSeat(agentId, amount, premiumBps, maxPremiumBps, nonce, deadline, sig)" who="seat-holder" />
                  <FnRow sig="borrow(agentId, amount, termDays, to)" who="agent (owner/operatorWallet)" />
                  <FnRow sig="repay(loanId)" who="anyone" />
                  <FnRow sig="markDefault(loanId)" who="anyone (permissionless by design)" last />
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto rounded-[3px] border border-[var(--line)]">
              <table className="w-full text-xs">
                <tbody>
                  <FnRow sig="sharesValue(address) / freeCapacity(address)" who="view" />
                  <FnRow sig="agentInfo(agentId) / available(agentId)" who="view" />
                  <FnRow sig="sponsorsOf(agentId) / sponsorStakeOf(agentId, sponsor)" who="view" />
                  <FnRow sig="loanInfo(loanId) / loanSharesOf(loanId)" who="view" />
                  <FnRow sig="seatEligible(agentId) / seatTokenRequiredFor(amount)" who="view" />
                  <FnRow sig="isRoot(address) / nextLoanId() / totalBadDebt()" who="view" last />
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      </section>
      <PortalFooter />
    </div>
  );
}

function RoleCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[3px] border border-[var(--line)] bg-[var(--panel-2)] p-4">
      <div className="font-medium text-[var(--ink)]">{title}</div>
      <p className="mt-1.5 text-xs text-[var(--muted)] leading-relaxed">{children}</p>
    </div>
  );
}

function InvariantCard({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[3px] border border-[var(--line)] bg-[var(--panel-2)] p-4">
      <div className="font-mono text-[10px] text-[#d6ae61]">{id}</div>
      <p className="mt-1.5 text-xs text-[var(--muted)] leading-relaxed">{children}</p>
    </div>
  );
}

function StateRow({ from, to, via }: { from: string; to: string; via: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="rounded-[2px] border border-[var(--line)] px-2 py-0.5 text-[var(--ink)]">{from}</span>
      <span className="mt-0.5 text-[var(--muted)]">→</span>
      <span className="rounded-[2px] border border-[var(--line)] px-2 py-0.5 text-[var(--ink)]">{to}</span>
      <span className="mt-0.5 flex-1 text-[var(--muted)]">{via}</span>
    </div>
  );
}

function ParamRow({ name, value, meaning, mono }: { name: string; value: string; meaning: string; mono?: boolean }) {
  return (
    <tr className="border-t border-[var(--line)] first:border-t-0">
      <td className="px-3 py-2 align-top text-[var(--muted)]">{name}</td>
      <td className={`px-3 py-2 align-top text-[var(--ink)] ${mono ? "break-all font-mono text-xs" : ""}`}>{value}</td>
      <td className="px-3 py-2 align-top text-[var(--muted)]">{meaning}</td>
    </tr>
  );
}

function FnRow({ sig, who, last }: { sig: string; who: string; last?: boolean }) {
  return (
    <tr className={last ? "" : "border-b border-[var(--line)]"}>
      <td className="px-3 py-2 align-top font-mono text-[var(--ink)]">{sig}</td>
      <td className="whitespace-nowrap px-3 py-2 align-top text-right text-[var(--muted)]">{who}</td>
    </tr>
  );
}
