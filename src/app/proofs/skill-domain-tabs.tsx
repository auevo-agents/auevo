"use client";

import { useState, type ReactNode } from "react";

/**
 * Shows exactly one Skill domain's full section (Try-it + spec box +
 * recent attempts, built server-side and handed in as children) at a
 * time instead of stacking all four — the page was getting long enough
 * that a visitor had to scroll past three other domains' Try-it panels
 * to reach the one they wanted. The server still renders every domain's
 * content (so there's no client-side fetch waterfall and no layout
 * shift once a tab is picked); this just toggles which one is visible.
 *
 * `initialTab` lets the server page open straight onto a specific domain
 * (e.g. from a Playzone catalog card's `?domain=sql` link) instead of
 * always defaulting to the first tab — falls back to tabs[0] if the key
 * doesn't match any tab.
 */
export function SkillDomainTabs({ tabs, initialTab }: { tabs: { key: string; label: string; panel: ReactNode }[]; initialTab?: string }) {
  const [active, setActive] = useState(tabs.some((t) => t.key === initialTab) ? initialTab : tabs[0]?.key);
  const activePanel = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-white/[0.06] pb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`rounded-[3px] border px-4 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#c9ad70]/50 focus-visible:ring-offset-0 ${
              active === t.key ? "border-[#c9ad70]/40 bg-[#c9ad70]/[0.12] text-[#ece8df]" : "border-white/[0.07] text-[#8b94a1] hover:text-[#ece8df]"
            }`}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-6">{activePanel?.panel}</div>
    </div>
  );
}
