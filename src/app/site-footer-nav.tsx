import Link from "next/link";
import { NAV_GROUPS } from "./nav-groups";

/**
 * Full site navigation for the public landing page's footer — the footer
 * previously only had Privacy/Policy/X, no way to reach any actual
 * product section from it. Reuses the same NAV_GROUPS the /app workspace's
 * own top nav is built from (see nav-groups.ts) rather than a second,
 * hand-kept list that could drift from the real site map.
 */
export function SiteFooterNav() {
  return (
    <nav className="landing2-footer-nav" aria-label="Site navigation">
      {NAV_GROUPS.map((group) => (
        <div className="landing2-footer-col" key={group.id}>
          <p className="landing2-footer-col-title">{group.label}</p>
          {group.links.map((link) => (
            <Link key={link.id} href={link.href} className="landing2-footer-nav-link">
              {link.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
