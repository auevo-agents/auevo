import Link from "next/link";
import type { Metadata } from "next";
import { LegalShell } from "../legal-shell";

export const metadata: Metadata = {
  title: "Policy — Auevo",
  description: "Terms of use, risk disclosures and trading policy for Auevo.",
};

export default function PolicyPage() {
  return (
    <LegalShell>
      <Link href="/" className="legal-page-back">
        ← Back to Auevo
      </Link>
      <h1>Policy</h1>
      <p className="legal-page-updated">Last updated September 2026</p>

      <section>
        <h2>Not investment advice</h2>
        <p>
          Nothing on Auevo — prices, premiums, risk scores, or any other
          figure — is investment, legal or tax advice. Auevo does not
          recommend any asset, issuer, chain, pool, or basket. You are solely
          responsible for your own trading decisions.
        </p>
      </section>

      <section>
        <h2>Tokenized assets are not the underlying security</h2>
        <p>
          A tokenized stock, ETF, treasury, commodity or private-credit
          token is a claim issued by a third-party issuer that tracks the
          price of an underlying asset. It is not the underlying security
          itself, does not carry shareholder rights unless the issuer
          explicitly says otherwise, and can trade at a premium or discount
          to the real asset. Always verify an issuer&apos;s own terms and
          backing disclosures before trading.
        </p>
      </section>

      <section>
        <h2>Non-custodial, self-directed</h2>
        <p>
          Auevo does not issue, custody, or guarantee any token shown on the
          site. Every trade, swap, bridge, basket purchase or pool deposit
          executes on-chain through your own wallet signature — Auevo never
          holds your funds and cannot reverse a transaction once it is
          signed.
        </p>
      </section>

      <section>
        <h2>Data accuracy</h2>
        <p>
          Prices, liquidity, volume and risk indicators are sourced from
          on-chain reads and public market-data providers on a best-effort
          basis. Data can be delayed, incomplete, or temporarily unavailable
          — never treat a figure on Auevo as guaranteed accurate at the
          moment you trade. Confirm the final price and route in your
          wallet before signing.
        </p>
      </section>

      <section>
        <h2>Credit (AgentCreditPool) — lending, sponsoring and seats</h2>
        <p>
          AgentCreditPool is experimental, unaudited software — written and tested, reviewed by hand, but not
          verified by a paid, independent, professional audit. Depositing, vouching, backing a seat or borrowing
          means accepting that risk: a bug could behave unexpectedly, and Auevo has no admin key, no pause switch and
          no way to reverse anything once it is on chain.
        </p>
        <p>
          Auevo itself never backs an agent, never deposits capital into the pool, and never guarantees any loan —
          every credit line exists only because a third party chose to vouch for that agent with its own funds, or
          to back it with a seat. If you lend (deposit), the contract is designed so a loan default is paid first by
          the sponsors and seat-holders who backed that specific loan, never out of your deposited principal — but
          that is the contract&apos;s intended behavior, not a promise Auevo can guarantee against a bug. If you
          sponsor or back a seat, you can lose up to what you vouched or locked, and only for loans you actually
          backed.
        </p>
        <p>
          A seat token lock (intended to be $AUEVO) is an additional layer on top of ordinary USDG backing, not a
          substitute for it, and is slashed independently on a default of the loan it backed — see{" "}
          <Link href="/credit/protocol">the protocol page</Link>{" "}
          for the full mechanics before participating.
        </p>
      </section>

      <section>
        <h2>Automated features (baskets, private swap, alerts)</h2>
        <p>
          Automated rebalancing, MEV-protected relayed swaps, and alert
          notifications are best-effort conveniences, not guarantees of
          execution, timing, or outcome. You remain responsible for
          reviewing and authorizing every on-chain action taken on your
          behalf.
        </p>
      </section>

      <section>
        <h2>Eligibility</h2>
        <p>
          You are responsible for determining whether using Auevo is lawful
          in your jurisdiction. Auevo does not make any representation about
          the legality of tokenized-asset trading where you live.
        </p>
      </section>
    </LegalShell>
  );
}
