import Link from "next/link";

/**
 * Just "Protocol" (always active — this page is the only one left under
 * /credit/protocol) plus a plain link out to the site-wide /dev-log,
 * which replaced the Credit-only dev log that used to live nested here.
 */
export function ProtocolSubnav() {
  return (
    <nav className="mb-6 flex items-center gap-1 text-sm">
      <span className="rounded-[2px] bg-white/[0.05] px-3 py-1.5 text-[var(--ink)]">Protocol</span>
      <Link href="/dev-log" className="rounded-[2px] px-3 py-1.5 text-[var(--muted)] hover:text-[var(--ink)]">
        Dev log →
      </Link>
    </nav>
  );
}
