import Link from "next/link";
import type { Metadata } from "next";
import { LegalShell } from "../legal-shell";

export const metadata: Metadata = {
  title: "Privacy — Auevo",
  description: "How Auevo handles data when you use the site and connect a wallet.",
};

export default function PrivacyPage() {
  return (
    <LegalShell>
      <Link href="/" className="legal-page-back">
        ← Back to Auevo
      </Link>
      <h1>Privacy</h1>
      <p className="legal-page-updated">Last updated September 2026</p>

      <section>
        <h2>What Auevo is</h2>
        <p>
          Auevo is a non-custodial interface for tokenized real-world assets:
          a scanner, marketplace and trading front-end. We never take custody
          of your funds and never require an account, email, or KYC to browse
          the site or connect a wallet.
        </p>
      </section>

      <section>
        <h2>Wallet connections</h2>
        <p>
          Connecting a wallet lets the site read your public address and
          on-chain balances so it can show your portfolio, and lets you sign
          transactions yourself. Auevo never has access to your private keys
          or seed phrase, and never initiates a transaction without your
          signature.
        </p>
      </section>

      <section>
        <h2>What we collect</h2>
        <p>
          Standard, aggregated web analytics (pages viewed, general region,
          device type) to understand usage and fix bugs — no data broker
          sale, no ad tracking. If you link a Telegram account to receive
          alerts, we store your Telegram chat ID solely to deliver the alerts
          you subscribe to, and nothing else about your Telegram account.
        </p>
      </section>

      <section>
        <h2>Third-party data and routing</h2>
        <p>
          Prices, liquidity and route data are pulled live from public
          sources (on-chain reads, GeckoTerminal, LI.FI and similar) to
          render pages — those requests do not carry your identity beyond
          what a public blockchain address already exposes. Swaps and
          bridges you execute are routed through LI.FI and settle on-chain;
          Auevo does not see or store your transaction contents beyond what
          is already public on-chain.
        </p>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>
          We use only the minimum cookies/local storage needed for the site
          to function (e.g. remembering your wallet connection preference) —
          no third-party ad or tracking cookies.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions about this policy — reach us at{" "}
          <a href="https://x.com/Auevotrade" target="_blank" rel="noreferrer">
            x.com/Auevotrade
          </a>
          .
        </p>
      </section>
    </LegalShell>
  );
}
