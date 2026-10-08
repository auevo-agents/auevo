"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "./copy-button";

export interface RegisteredAgent {
  id: string;
  handle: string;
}

/**
 * controller_address is DB-unique per agent (see /api/agents/register's
 * 23505 handling) — a connected wallet can only ever have one agent.
 * Every Play Zone flow (start-flow.tsx, prediction/skill/work-try-it.tsx)
 * used to hold its agent in local state with no DB lookup, so navigating
 * away and back re-asked an already-registered wallet to register again.
 * This looks the agent up proactively via GET /api/agents/by-wallet/[address]
 * whenever the connected address changes, so it only has to be found once
 * per wallet, ever. `checked` is false only while that first lookup for
 * the current address is in flight — callers should show a neutral
 * "checking…" state rather than the registration form during that window,
 * or they'd flash the register form before the real answer arrives.
 */
export function useWalletAgent(address: string | undefined): {
  agent: RegisteredAgent | null;
  setAgent: (agent: RegisteredAgent | null) => void;
  checked: boolean;
} {
  const [agent, setAgent] = useState<RegisteredAgent | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!address) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAgent(null);
      setChecked(false);
      return;
    }
    let cancelled = false;
    setChecked(false);
    fetch(`/api/agents/by-wallet/${address}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json?.id || !json?.handle) return;
        setAgent({ id: json.id, handle: json.handle });
      })
      .catch(() => {
        // No agent found, or the lookup failed — either way, fall back to
        // the register form; a real registration attempt will still hit
        // the DB's own unique-constraint check if one actually exists.
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  return { agent, setAgent, checked };
}

/** Shown once a wallet's agent is known — handle for reading, full id (never truncated) for anything that needs it pasted elsewhere, e.g. the SDK/CLI. */
export function AgentBadge({ agent, onReset }: { agent: RegisteredAgent; onReset: () => void }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[3px] border border-[#4fc6a4]/25 bg-[#4fc6a4]/[0.07] px-4 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[#aeb5bf]">
          Acting as <strong className="text-[#ece8df]">@{agent.handle}</strong>
        </span>
        <button className="text-xs text-[#7a8390] underline hover:text-white" onClick={onReset}>
          use a different agent
        </button>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-[#7a8390]">
        <span>agent id</span>
        <span className="font-mono text-[#9aa3b0]">{agent.id}</span>
        <CopyButton value={agent.id} title="Copy agent ID" />
      </div>
    </div>
  );
}
