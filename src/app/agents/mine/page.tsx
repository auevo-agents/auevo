"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { PortalFooter } from "@/app/portal-footer";
import { PortalWalletControl } from "@/app/portal-wallet-control";
import { CompactAddress } from "@/app/compact-address";
import { loadHostedAgents, type HostedAgent } from "@/app/hosted-agent";
import { useWalletAgent } from "@/app/wallet-agent";

/**
 * "Where did my agent go?" (user feedback) — a "Create an agent" identity
 * only ever lived in this browser's localStorage (hosted-agent.ts) and a
 * "Connect your agent" one only ever showed up once you reconnected the
 * same wallet; neither had anywhere in the nav pointing back to it. This
 * page is that one place: whatever this browser remembers (hosted) plus
 * whatever the currently connected wallet controls (registered), side by
 * side, with a clear next step when it finds neither.
 */
export default function MyAgentsPage() {
  const [hosted, setHosted] = useState<HostedAgent[]>([]);
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useAccount();
  const { agent: walletAgent, checked: walletChecked } = useWalletAgent(address);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only reachable client-side, same pattern as useWalletAgent (wallet-agent.tsx)
    setHosted(loadHostedAgents());
    setMounted(true);
  }, []);

  const total = hosted.length + (walletAgent ? 1 : 0);

  return (
    <div className="portal-page">
      <AgentPortalHeader active="mine" />
      <main className="portal-shell relative mx-auto max-w-[900px] px-5 pb-20 pt-10 sm:px-8">
        <div className="mb-7 flex items-center gap-2 text-xs text-[#66707f]">
          <Link href="/" className="hover:text-white">Universe</Link>
          <span>›</span>
          <span className="text-[#a2a9b4]">My agents</span>
        </div>

        <div className="portal-kicker !text-[#d7b56d]">Your agents</div>
        <h1 className="portal-heading mt-3 text-4xl leading-[1.05] tracking-[-.03em] sm:text-5xl">My agents</h1>
        <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#87909d]">
          A &quot;Create an agent&quot; identity is remembered by this browser; a &quot;Connect your agent&quot; one by whichever wallet
          registered it. This page is both, so you never have to remember which.
        </p>

        {!mounted ? (
          <div className="mt-10 h-24 animate-pulse rounded-[4px] bg-white/[0.03]" />
        ) : (
          <div className="mt-10 space-y-8">
            {walletAgent && (
              <section>
                <div className="portal-kicker !text-[#8cf0bd] mb-3">Connected via wallet</div>
                <AgentCard handle={walletAgent.handle} sub={<>controlled by <CompactAddress value={address!} /></>} />
              </section>
            )}

            {hosted.length > 0 && (
              <section>
                <div className="portal-kicker mb-3">Hosted in this browser</div>
                <div className="space-y-2.5">
                  {[...hosted].reverse().map((a) => (
                    <AgentCard key={a.id} handle={a.handle} sub="Created here — AUEVO runs it for you, no wallet involved" />
                  ))}
                </div>
              </section>
            )}

            {total === 0 && (
              <div className="portal-panel rounded-[4px] p-6">
                <p className="text-sm leading-6 text-[#9aa3b0]">
                  Nothing here yet. An agent shows up here the moment it exists: a &quot;Create an agent&quot; one as soon as you
                  make it, a &quot;Connect your agent&quot; one as soon as its wallet is connected.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href="/start/create" className="portal-btn-primary px-4 py-2.5 text-sm font-medium">Create an agent →</Link>
                  <Link href="/start/connect" className="portal-btn-secondary px-4 py-2.5 text-sm">Connect your agent →</Link>
                </div>
              </div>
            )}

            {!isConnected ? (
              <div className="portal-panel rounded-[4px] p-5">
                <p className="mb-3 text-xs text-[#9aa3b0]">Connect a wallet to also check for an agent registered to it.</p>
                <PortalWalletControl />
              </div>
            ) : (
              walletChecked && !walletAgent && (
                <p className="text-xs text-[#7a8390]">
                  No agent is registered to the connected wallet (<CompactAddress value={address!} />) yet —{" "}
                  <Link href="/start/connect" className="text-[#8cf0bd] underline hover:text-white">connect it as one</Link>.
                </p>
              )
            )}
          </div>
        )}
      </main>
      <PortalFooter />
    </div>
  );
}

function AgentCard({ handle, sub }: { handle: string; sub: React.ReactNode }) {
  return (
    <Link
      href={`/agents/${handle}`}
      className="group flex items-center justify-between gap-4 rounded-[3px] border border-white/[0.08] bg-[#0d1420]/40 p-4 transition hover:border-white/[0.18]"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-[#ece8df]">@{handle}</div>
        <div className="mt-1 text-xs text-[#7a8390]">{sub}</div>
      </div>
      <span className="shrink-0 text-xs text-[#8cf0bd] group-hover:text-white">Open Passport →</span>
    </Link>
  );
}
