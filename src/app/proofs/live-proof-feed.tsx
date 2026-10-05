"use client";

import { useEffect, useRef, useState } from "react";
import { categoryLabel } from "@/app/proofs/reputation-structure";
import { timeAgo } from "@/app/proofs/time-ago";
import type { RecentProofEvent } from "@/lib/auevo/db";

const POLL_MS = 9000;
const MAX_ROWS = 5;
const FLASH_MS = 2200;

/**
 * The hero's "Live proof feed" panel, made genuinely live: the server
 * still renders the first paint from the same listRecentProofEvents()
 * every other render of this page uses (no flash of empty state), but
 * from then on this polls GET /api/auevo/proofs/recent for real new rows
 * and animates them in — never a fabricated tick or a fake row, only
 * actual Proof Events landing in the same ledger /proofs itself reads.
 */
export function LiveProofFeed({ initialProofs }: { initialProofs: RecentProofEvent[] }) {
  const [proofs, setProofs] = useState(initialProofs.slice(0, MAX_ROWS));
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const knownIds = useRef(new Set(initialProofs.map((p) => p.id)));

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    async function poll() {
      try {
        const res = await fetch(`/api/auevo/proofs/recent?limit=${MAX_ROWS}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const fetched = (json.proofs ?? []) as RecentProofEvent[];
        if (fetched.length === 0) return;

        const freshIds = fetched.filter((p) => !knownIds.current.has(p.id)).map((p) => p.id);
        for (const p of fetched) knownIds.current.add(p.id);

        setProofs(fetched);
        if (freshIds.length > 0) {
          setFlashIds((prev) => new Set([...prev, ...freshIds]));
          const t = setTimeout(() => {
            if (cancelled) return;
            setFlashIds((prev) => {
              const next = new Set(prev);
              for (const id of freshIds) next.delete(id);
              return next;
            });
          }, FLASH_MS);
          timers.push(t);
        }
      } catch {
        // A failed poll just keeps showing the last known rows — never worth surfacing an error on a decorative feed.
      }
    }

    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      timers.forEach(clearTimeout);
    };
  }, []);

  if (proofs.length === 0) return <p className="text-[#5e6a7c]">No Proofs yet.</p>;

  return (
    <>
      {proofs.map((p) => (
        <div key={p.id} className={`live-feed-row flex items-center justify-between gap-3 ${flashIds.has(p.id) ? "live-feed-row-flash" : ""}`}>
          <span className="flex min-w-0 items-center gap-2">
            <i className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.status === "passed" ? "bg-[#42d995]" : p.status === "scheduled" || p.status === "running" || p.status === "awaiting_settlement" ? "bg-[#d6ae61]" : "bg-[#e0735c]"}`} />
            <span className="truncate">
              {p.handle ? `@${p.handle}` : "agent"} · {categoryLabel(p.category)}
            </span>
            {flashIds.has(p.id) && (
              <span className="live-feed-row-new-chip shrink-0 rounded-[2px] border border-[#42d995]/40 bg-[#42d995]/15 px-1.5 py-0.5 text-[8px] uppercase tracking-[.1em] text-[#8cf0bd]">
                new
              </span>
            )}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-[#69768a]">{timeAgo(p.createdAt)}</span>
        </div>
      ))}
    </>
  );
}
