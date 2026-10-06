"use client";

import { Fragment, useState } from "react";
import type { DevLogEntry } from "@/lib/dev-log";

/**
 * Renders a DevLogEntry[] as a table: date, a one-line description (the
 * entry's own title), and a per-row expand control that reveals the full
 * body paragraphs beneath it. Same component shape as Credit's own
 * src/app/credit/protocol/dev-log/dev-log-table.tsx, kept as a separate
 * copy rather than shared so this page's content stays free to diverge
 * (e.g. a future "pin this entry" control) without touching Credit's.
 * The newest entry (index 0 — entries are stored newest-first) starts
 * expanded; every other row starts collapsed.
 */
export function DevLogTable({ entries }: { entries: DevLogEntry[] }) {
  const [openRows, setOpenRows] = useState<Record<number, boolean>>({ 0: true });

  function toggle(i: number) {
    setOpenRows((prev) => ({ ...prev, [i]: !prev[i] }));
  }

  return (
    <div className="mt-10 overflow-x-auto rounded-[3px] border border-white/[0.07]">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-[92px] sm:w-[120px]" />
          <col />
          <col className="w-[44px] sm:w-[56px]" />
        </colgroup>
        <thead>
          <tr className="border-b border-white/[0.07] bg-white/[0.015]">
            <th className="px-3 py-2 text-left text-[11px] font-mono uppercase tracking-[.06em] text-[#667d70]">
              Date
            </th>
            <th className="px-3 py-2 text-left text-[11px] font-mono uppercase tracking-[.06em] text-[#667d70]">
              Change
            </th>
            <th className="px-3 py-2 text-right text-[11px] font-mono uppercase tracking-[.06em] text-[#667d70]">
              <span className="sr-only">Expand</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => {
            const open = Boolean(openRows[i]);
            const panelId = `dev-log-body-${i}`;
            return (
              <Fragment key={`${entry.date}-${i}`}>
                <tr className={i === 0 ? "" : "border-t border-white/[0.045]"}>
                  <td className="px-3 py-3 align-top font-mono text-xs text-[#d6ae61]">{entry.date}</td>
                  <td className="px-3 py-3 align-top text-[#ece8df]">
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      aria-expanded={open}
                      aria-controls={panelId}
                      className="w-full text-left font-medium hover:text-[#8fc9a6]"
                    >
                      {entry.title}
                    </button>
                  </td>
                  <td className="px-3 py-3 align-top text-right">
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      aria-expanded={open}
                      aria-controls={panelId}
                      aria-label={open ? "Collapse entry" : "Expand entry"}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-[3px] border border-white/[0.08] text-[#7a8390] hover:text-[#ece8df]"
                    >
                      <span aria-hidden className={"transition-transform " + (open ? "rotate-45" : "")}>
                        +
                      </span>
                    </button>
                  </td>
                </tr>
                {open && (
                  <tr id={panelId} className="border-t border-white/[0.045] bg-white/[0.015]">
                    <td />
                    <td colSpan={2} className="px-3 py-3">
                      <div className="flex flex-col gap-2">
                        {entry.body.map((p, j) => (
                          <p key={j} className="text-sm leading-relaxed text-[#8f9bad]">
                            {p}
                          </p>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
