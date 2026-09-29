"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AuevoLogo } from "../auevo-logo";
import { NAV_GROUPS } from "../nav-groups";
import { NavIcon } from "../nav-icons";

function isActive(pathname: string, href: string): boolean {
  return href === "/app" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setMobileOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  return (
    <header className="app-topnav" ref={rootRef}>
      <div className="hybrid-sidebar-head">
        <Link href="/" className="app-topnav-logo" aria-label="Auevo home">
          <AuevoLogo />
        </Link>
        <button type="button" className="app-mobile-menu" aria-expanded={mobileOpen} aria-controls="auevo-app-navigation" onClick={() => setMobileOpen((value) => !value)}>
          {mobileOpen ? "Close" : "Menu"}
        </button>
      </div>
      <nav id="auevo-app-navigation" className={mobileOpen ? "app-topnav-links mobile-open" : "app-topnav-links"} aria-label="Workspace">
        <Link href="/app" className={isActive(pathname, "/app") ? "app-nav-link active" : "app-nav-link"} onClick={() => setMobileOpen(false)}>
          <NavIcon kind="home" size={17} /><span>Overview</span>
        </Link>
        {NAV_GROUPS.map((group) => (
          <div className="hybrid-nav-section" key={group.id}>
            <span className="hybrid-nav-heading">{group.label}</span>
            {group.links.map((link) => (
              <Link key={link.id} href={link.href} className={isActive(pathname, link.href) ? "app-nav-link active" : "app-nav-link"} onClick={() => setMobileOpen(false)}>
                {link.icon && <NavIcon kind={link.icon} size={17} />}
                <span>{link.label}</span>
                {link.soon && <small>Soon</small>}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="app-topnav-trust"><span className="app-topnav-trust-dot" /> Verified registry</div>
    </header>
  );
}
