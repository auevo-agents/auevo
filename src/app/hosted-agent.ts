"use client";

const STORAGE_KEY = "auevo_hosted_agent";

export interface HostedAgent {
  id: string;
  handle: string;
  /** Bearer secret that authorizes triggering this agent's executor runs — returned once at creation, never recoverable afterward. */
  runSecret: string;
}

/**
 * A "Create an agent" agent has no wallet to look it up by (unlike
 * useWalletAgent, wallet-agent.tsx), so its identity + run secret are
 * kept client-side the same way a registered agent's {id, handle} are —
 * just under their own key, and including the run secret since nothing
 * server-side can re-derive it.
 */
export function loadHostedAgent(): HostedAgent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.id === "string" && typeof parsed?.handle === "string" && typeof parsed?.runSecret === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

export function saveHostedAgent(agent: HostedAgent): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agent));
  } catch {
    // Private browsing / storage disabled — the agent still exists server-side, just not re-discoverable from this browser.
  }
}

export function clearHostedAgent(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage was never writable.
  }
}
