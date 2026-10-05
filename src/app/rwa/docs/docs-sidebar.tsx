"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { DOC_SECTIONS } from "./content";

/**
 * GitBook's own left sidebar: a search box, then sections each with
 * their own page list, the current page highlighted. Filtering is
 * client-side title/summary matching — there's no full-text index here,
 * just enough to jump straight to a page by name in a doc set this
 * size. Scoped to the RWA trading platform only — see content.ts.
 */
export function DocsSidebar() {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  return (
    <nav className="docs-sidebar">
      <div className="docs-sidebar-intro">
        <span>Product guide</span>
        <strong>How the Auevo RWA marketplace works.</strong>
        <p>Assets, issuers, trading, pools, lending and alerts — one reference for the trading platform.</p>
      </div>

      <div className="docs-sidebar-search">
        <span className="dash-search-icon">⌕</span>
        <input
          type="text"
          placeholder="Search docs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <kbd>/</kbd>
      </div>

      {DOC_SECTIONS.map((section, sectionIndex) => {
        const pages = q
          ? section.pages.filter(
              (p) => p.title.toLowerCase().includes(q) || p.summary.toLowerCase().includes(q)
            )
          : section.pages;
        if (pages.length === 0) return null;

        return (
          <div className="docs-nav-section" key={section.id}>
            <p className="docs-nav-section-title"><span>{String(sectionIndex + 1).padStart(2, "0")}</span>{section.title}</p>
            {pages.map((page) => (
              <Link
                key={page.slug}
                href={`/rwa/docs/${page.slug}`}
                className={pathname === `/rwa/docs/${page.slug}` ? "docs-nav-link active" : "docs-nav-link"}
              >
                {page.title}
              </Link>
            ))}
          </div>
        );
      })}
    </nav>
  );
}
