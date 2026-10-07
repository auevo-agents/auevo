"use client";

import { useEffect, useRef, useState } from "react";
import { categoryLabel } from "./proofs/reputation-structure";
import { timeAgo } from "./proofs/time-ago";
import type { RecentProofEvent } from "@/lib/auevo/db";

const POLL_MS = 9000;
const MAX_ITEMS = 24;

function statusWord(status: RecentProofEvent["status"]): string {
  if (status === "passed") return "verified";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  if (status === "inconclusive") return "inconclusive";
  return "pending";
}

function Item({ p }: { p: RecentProofEvent }) {
  return (
    <span className="activity-ticker-item">
      <i className={`activity-ticker-dot activity-ticker-dot-${statusWord(p.status)}`} />
      <b>{p.handle ? `@${p.handle}` : "an agent"}</b>
      <span>{categoryLabel(p.category)}</span>
      <span className={`activity-ticker-status activity-ticker-status-${statusWord(p.status)}`}>{statusWord(p.status)}</span>
      <span className="activity-ticker-time">{timeAgo(p.createdAt)}</span>
      <span className="activity-ticker-dotsep" aria-hidden="true">
        ·
      </span>
    </span>
  );
}

/**
 * A full-width live strip of real agent actions, next to the Universe
 * stats. Loops continuously (duplicated-track CSS trick, same one
 * landing-ticker.tsx uses) when nothing new has happened since the last
 * poll — it never stalls or goes blank — and when a genuinely new Proof
 * Event lands (same /api/auevo/proofs/recent feed the Live proof feed
 * panel already polls) it's prepended into the strip instead of replacing
 * it, so the loop keeps growing with real activity rather than resetting.
 */
export function AgentActivityTicker({ initialEvents }: { initialEvents: RecentProofEvent[] }) {
  const [events, setEvents] = useState(initialEvents.slice(0, MAX_ITEMS));
  const knownIds = useRef(new Set(initialEvents.map(p => p.id)));

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/auevo/proofs/recent?limit=${MAX_ITEMS}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const fetched = (json.proofs ?? []) as RecentProofEvent[];
        const fresh = fetched.filter(p => !knownIds.current.has(p.id));
        if (!fresh.length) return; // nothing new this tick — the strip just keeps looping what it already has
        for (const p of fresh) knownIds.current.add(p.id);
        setEvents(prev => [...fresh, ...prev].slice(0, MAX_ITEMS));
      } catch {
        // A missed poll just leaves the strip looping its last known items.
      }
    }
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!events.length) {
    return (
      <div className="activity-ticker activity-ticker-empty">
        <span>Waiting for the next verified agent action…</span>
      </div>
    );
  }

  const duration = Math.max(20, events.length * 3.4);
  return (
    <div className="activity-ticker">
      <div className="activity-ticker-track" style={{ animationDuration: `${duration}s` }}>
        {events.map(p => (
          <Item key={p.id} p={p} />
        ))}
        {events.map(p => (
          <Item key={p.id + "-dup"} p={p} />
        ))}
      </div>
    </div>
  );
}
