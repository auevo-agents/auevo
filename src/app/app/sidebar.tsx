"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AuevoLogo } from "../auevo-logo";
import { NAV_GROUPS, type NavGroup } from "../nav-groups";
import { NavIcon } from "../nav-icons";

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isGroupActive(pathname: string, group: NavGroup): boolean {
  return group.links.some((link) => isActive(pathname, link.href));
}

export function Sidebar() {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!openGroup && !mobileOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpenGroup(null);
        setMobileOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenGroup(null);
        setMobileOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openGroup, mobileOpen]);

  return (
    <header className="app-topnav" ref={rootRef}>
      <Link href="/" className="app-topnav-logo" aria-label="Auevo home">
        <AuevoLogo />
        <span className="app-topnav-edition">Market intelligence</span>
      </Link>

      <button
        type="button"
        className="app-mobile-menu"
        aria-expanded={mobileOpen}
        onClick={() => {
          setMobileOpen((value) => !value);
          setOpenGroup(null);
        }}
      >
        {mobileOpen ? "Close" : "Menu"}
      </button>

      <nav className={mobileOpen ? "app-topnav-links mobile-open" : "app-topnav-links"}>
        <Link
          href="/app"
          className={isActive(pathname, "/app") && pathname === "/app" ? "app-nav-link active" : "app-nav-link"}
          onClick={() => setMobileOpen(false)}
        >
          <NavIcon kind="home" size={15} />
          <b>Overview</b>
        </Link>

        <Link
          href="/app/agent"
          className={isActive(pathname, "/app/agent") ? "app-nav-link active" : "app-nav-link"}
          onClick={() => setMobileOpen(false)}
        >
          <NavIcon kind="sparkle" size={15} />
          <b>AUEVO AI</b>
          <span className="app-nav-soon-badge">soon</span>
        </Link>

        {NAV_GROUPS.map((group) => (
          <div className="app-nav-group" key={group.id}>
            <button
              type="button"
              className={isGroupActive(pathname, group) ? "app-nav-link app-nav-group-trigger active" : "app-nav-link app-nav-group-trigger"}
              aria-expanded={openGroup === group.id}
              onClick={() => setOpenGroup((value) => (value === group.id ? null : group.id))}
            >
              <b>{group.label}</b>
            </button>

            {openGroup === group.id && (
              <div className="app-nav-group-panel">
                {group.links.map((link) => (
                  <Link
                    key={link.id}
                    href={link.href}
                    className={isActive(pathname, link.href) ? "app-nav-group-link active" : "app-nav-group-link"}
                    onClick={() => {
                      setOpenGroup(null);
                      setMobileOpen(false);
                    }}
                  >
                    {link.icon && <NavIcon kind={link.icon} size={15} />}
                    {link.label}
                    {link.soon && <span className="app-nav-soon-badge">soon</span>}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="app-topnav-trust" aria-label="Registry status">
        <span className="app-topnav-trust-dot" />
        <span>Verified registry</span>
      </div>
    </header>
  );
}
