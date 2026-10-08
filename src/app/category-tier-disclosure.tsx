"use client";

import { useState } from "react";

/**
 * The per-category tier grid (progression-flow.tsx) is dense enough —
 * 6 cards, 3 rungs each — that showing it open by default pushed the
 * "capital" section's own point (register -> prove -> back -> borrow)
 * well below the fold. Collapsed by default; the deep-dive is still one
 * click away for anyone who wants it.
 */
export function CategoryTierDisclosure({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" className="text-xs text-[#8cf0bd] underline hover:text-white" onClick={() => setOpen((v) => !v)}>
        {open ? "Hide category tiers" : "See how each category builds tier →"}
      </button>
      {open && <div className="mt-5">{children}</div>}
    </div>
  );
}
