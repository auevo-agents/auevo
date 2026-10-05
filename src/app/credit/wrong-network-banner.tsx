"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { ROBINHOOD_CHAIN_ID } from "@/lib/chains";

/**
 * The actual cause behind "buttons that look permanently disabled":
 * getWagmiConfig() (shared with /rwa/app, which genuinely needs six
 * chains) supports mainnet/base/bsc/arbitrum/hyperEvm alongside Robinhood
 * Chain, so a wallet that's connected but still on its default chain
 * (almost always Ethereum mainnet) silently reads a chain that has none
 * of these contracts — every useReadContract here returns undefined
 * forever, with no visible error, which is exactly what makes a
 * perfectly-working disabled={!someRead} condition look like a dead
 * button. Every credit read/write now pins chainId explicitly so it
 * targets Robinhood Chain regardless of the wallet's active chain; this
 * banner is the other half — telling the visitor why, instead of leaving
 * them to guess.
 */
export function WrongNetworkBanner() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();

  if (!isConnected || chainId === ROBINHOOD_CHAIN_ID) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[3px] border border-[var(--red)]/40 bg-[var(--red)]/10 px-4 py-3 text-sm">
      <span className="text-[var(--red)]">
        Your wallet is connected to the wrong network. Everything on this page runs on Robinhood Chain (id {ROBINHOOD_CHAIN_ID}) — switch over, or every button below will look stuck with nothing visibly wrong.
      </span>
      <button
        className="shrink-0 rounded bg-[var(--ink)] px-3 py-1.5 text-xs text-[var(--bg)] disabled:opacity-50"
        disabled={isPending}
        onClick={() => switchChain({ chainId: ROBINHOOD_CHAIN_ID })}
      >
        {isPending ? "Switching…" : "Switch to Robinhood Chain"}
      </button>
      {error && <p className="w-full text-xs text-[var(--red)]">{error.message}</p>}
    </div>
  );
}
