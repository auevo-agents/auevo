"use client";

const STORAGE_KEY = "auevo_hosted_agents";
/** Pre-multi-agent storage shape (a single object, not an array) — read once to migrate anyone who created a hosted agent before this existed. */
const LEGACY_STORAGE_KEY = "auevo_hosted_agent";

export interface HostedAgent {
  id: string;
  handle: string;
  /** Bearer secret that authorizes triggering this agent's executor runs — returned once at creation, never recoverable afterward. */
  runSecret: string;
}

function isHostedAgent(value: unknown): value is HostedAgent {
  const v = value as Partial<HostedAgent> | null;
  return typeof v?.id === "string" && typeof v?.handle === "string" && typeof v?.runSecret === "string";
}

/**
 * A "Create an agent" agent has no wallet to look it up by (unlike
 * useWalletAgent, wallet-agent.tsx), so its identity + run secret are
 * kept client-side — but unlike a registered agent's {id, handle}, there
 * can be more than one of these per browser, so they're kept as a list
 * (oldest first) rather than a single slot. An earlier version of this
 * stored exactly one agent under LEGACY_STORAGE_KEY, overwriting it
 * whenever a second one was created — silently losing the ability to
 * manage the first. loadHostedAgents() folds that single legacy agent in
 * once, so nobody who already has one loses it.
 */
export function loadHostedAgents(): HostedAgent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: HostedAgent[] = raw ? JSON.parse(raw).filter(isHostedAgent) : [];

    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      if (isHostedAgent(legacy) && !list.some((a) => a.id === legacy.id)) list.unshift(legacy);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
    return list;
  } catch {
    return [];
  }
}

/** The one most recently created/saved hosted agent — for callers that just want *a* hosted agent to act as (the Play Zone quick-trial flow, /start's own resume-on-mount), not the full list. */
export function loadMostRecentHostedAgent(): HostedAgent | null {
  const list = loadHostedAgents();
  return list.length ? list[list.length - 1] : null;
}

/** The specific hosted agent with this id, if this browser remembers it — the right check for "do I own this one" (appearance-owner.tsx), as opposed to loadMostRecentHostedAgent()'s "any agent will do". */
export function findHostedAgent(id: string): HostedAgent | null {
  return loadHostedAgents().find((a) => a.id === id) ?? null;
}

/** Adds (or, if already present, moves to most-recent) a hosted agent — never overwrites a different agent's entry. */
export function saveHostedAgent(agent: HostedAgent): void {
  try {
    const list = loadHostedAgents().filter((a) => a.id !== agent.id);
    list.push(agent);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Private browsing / storage disabled — the agent still exists server-side, just not re-discoverable from this browser.
  }
}

/** Forgets one specific hosted agent in this browser (its run secret and all) — this does NOT delete the agent itself, which stays public and permanent; it just can no longer be managed from here. */
export function clearHostedAgent(id: string): void {
  try {
    const list = loadHostedAgents().filter((a) => a.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Nothing to clean up if storage was never writable.
  }
}
