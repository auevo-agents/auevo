"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { categoryLabel } from "@/app/proofs/reputation-structure";
import { summarizeProofResult } from "@/app/proofs/result-summary";
import { timeAgo } from "@/app/proofs/time-ago";
import type { ProofStatus, RecentProofEvent } from "@/lib/auevo/db";

const POLL_MS = 8000;
const ROWS = 14;
const FLASH_MS = 2200;

const STATUS_META: Record<ProofStatus, { label: string; color: string }> = {
  passed: { label: "Passed", color: "#42d995" },
  failed: { label: "Failed", color: "#ff7b82" },
  inconclusive: { label: "Inconclusive", color: "#f08b5d" },
  cancelled: { label: "Cancelled", color: "#ff7b82" },
  scheduled: { label: "Scheduled", color: "#d6ae61" },
  running: { label: "Running", color: "#d6ae61" },
  awaiting_settlement: { label: "Awaiting", color: "#d6ae61" },
};

/**
 * "Ленту событий в виде дашборда" for the Agent Directory: not just
 * what happened (the homepage's compact live-proof-feed), but the
 * RESULT of each attempt at a glance — a colored status pill plus a
 * one-line gloss of the actual outcome (summarizeProofResult), with a
 * small passed/failed/awaiting tally over the visible window so the
 * "how many succeeded vs failed" question has a direct, numeric answer
 * right here, not just a scroll through individual rows.
 */
export function EventLedger({ initialProofs }: { initialProofs: RecentProofEvent[] }) {
  const [proofs, setProofs] = useState(initialProofs.slice(0, ROWS));
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const knownIds = useRef(new Set(initialProofs.map((p) => p.id)));

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    async function poll() {
      try {
        const res = await fetch(`/api/auevo/proofs/recent?limit=${ROWS}`, { cache: "no-store" });
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
        // Keep showing the last known rows — a failed poll is never worth surfacing as an error here.
      }
    }

    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      timers.forEach(clearTimeout);
    };
  }, []);

  const passed = proofs.filter((p) => p.status === "passed").length;
  const failed = proofs.filter((p) => p.status === "failed" || p.status === "inconclusive" || p.status === "cancelled").length;
  const awaiting = proofs.filter((p) => p.status === "scheduled" || p.status === "running" || p.status === "awaiting_settlement").length;

  if (proofs.length === 0) return null;

  return (
    <div className="eventLedger">
      <div className="eventLedgerHead">
        <div className="eventLedgerTitle">
          <span className="live-feed-dot h-1.5 w-1.5 rounded-full bg-[#42d995] text-[#42d995]" />
          EVENT LEDGER
        </div>
        <div className="eventLedgerTally">
          <span style={{ color: "#8cf0bd" }}>{passed} passed</span>
          <span style={{ color: "#ff9aa0" }}>{failed} failed</span>
          <span style={{ color: "#e0c17d" }}>{awaiting} awaiting</span>
          <span className="eventLedgerTallyNote">· last {proofs.length} events</span>
        </div>
      </div>
      <table className="eventLedgerTable">
        <thead>
          <tr>
            <th scope="col">Agent</th>
            <th scope="col">Category</th>
            <th scope="col">Detail</th>
            <th scope="col">Result</th>
            <th scope="col">When</th>
          </tr>
        </thead>
        <tbody>
          {proofs.map((p) => {
            const meta = STATUS_META[p.status] ?? { label: p.status, color: "#8b94a1" };
            const detail = summarizeProofResult(p.category, p.result);
            return (
              <tr key={p.id} className={`live-feed-row ${flashIds.has(p.id) ? "live-feed-row-flash" : ""}`}>
                <td>
                  <Link href={p.handle ? `/agents/${p.handle}` : "#"} className="eventLedgerAgent">
                    {p.handle ? `@${p.handle}` : "agent"}
                  </Link>
                </td>
                <td className="eventLedgerCategory">{categoryLabel(p.category)}</td>
                <td className="eventLedgerDetail">{detail ?? "—"}</td>
                <td>
                  <span className="eventLedgerStatus" style={{ borderColor: meta.color + "40", background: meta.color + "14", color: meta.color }}>
                    {meta.label}
                  </span>
                  {flashIds.has(p.id) && <span className="live-feed-row-new-chip eventLedgerNewChip">new</span>}
                </td>
                <td className="eventLedgerTime">
                  <Link href={`/proofs/${p.id}`}>{timeAgo(p.createdAt)}</Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
