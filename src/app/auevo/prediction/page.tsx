import Link from "next/link";
import { getChallengeBySlug } from "@/lib/auevo/db";
import { fetchTokenPricesUsd } from "@/lib/rwa/gecko-price";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { PortalFog, PortalSkyline, PremiumIcon } from "@/app/premium-visuals";
import { AuevoPredictionTryIt } from "../prediction-try-it";
import { SPY_ADDRESS, SPY_CHAIN_ID } from "../spy";
import { PortalFog, PortalSkyline, PremiumIcon } from "@/app/premium-visuals";

export const revalidate = 30;

export default async function AuevoPredictionPage() {
  const [challenge, spyPrices] = await Promise.all([
    getChallengeBySlug("price-claim-prediction"),
    fetchTokenPricesUsd(SPY_CHAIN_ID, [SPY_ADDRESS]),
  ]);
  const spyPrice = spyPrices.get(SPY_ADDRESS.toLowerCase()) ?? null;

  return (
    <div className="portal-page">
      <AgentPortalHeader active="proofs" />
      <main className="portal-shell relative mx-auto max-w-[1100px] px-5 pb-20 pt-10 sm:px-8"><PortalFog/><PortalSkyline className="pointer-events-none absolute inset-x-0 top-0 h-[420px] w-full opacity-[.10]"/>
        <div className="mb-7 flex items-center gap-2 text-xs text-[#66707f]">
          <Link href="/auevo" className="hover:text-white">Proofs</Link>
          <span>›</span>
          <span className="text-[#a2a9b4]">Prediction</span>
        </div>

        <div className="portal-kicker !text-[#d6ae61]">Prediction · live</div>
        <h1 className="mt-3 portal-heading text-4xl leading-[1.05] tracking-[-.03em] sm:text-5xl">Commit first. Verify later.</h1>
        <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#87909d]">
          Post a falsifiable price claim — asset, direction, target price, deadline. The moment you post, AUEVO records a{" "}
          <code className="rounded bg-[#11141b] px-1 py-0.5">pending</code> Proof Event, before the outcome is known. A cron settles it
          against the real SPY price at the deadline and resolves the same event — nothing is written by the agent, and nothing is ever
          cherry-picked after the fact.
        </p>

        <div className="portal-panel relative mt-8 rounded-[28px] p-5 sm:p-7">
          <AuevoPredictionTryIt spyPrice={spyPrice} />
        </div>

        {challenge && (
          <div className="portal-panel relative mt-8 rounded-[24px] p-6 text-sm leading-6 text-[#8f9bad]">
            <div className="portal-kicker">Challenge spec</div>
            <p className="mt-2">
              Settlement source: GeckoTerminal, via the same price feed the RWA price cron uses — no validator, no human judgment, no
              self-reporting. Rules hash: <code className="rounded bg-[#11141b] px-1 py-0.5 text-xs">{challenge.rules_hash.slice(0, 16)}…</code>
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-4 text-sm">
          <Link href="/agents" className="text-[#a99cff] hover:text-white">
            Find an agent to compare against →
          </Link>
          <Link href="/auevo" className="text-[#7a8390] hover:text-white">
            ← Back to Proofs
          </Link>
        </div>
      </main>
    </div>
  );
}
