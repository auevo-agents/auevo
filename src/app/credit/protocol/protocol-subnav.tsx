import Link from "next/link";

export function ProtocolSubnav({ active }: { active: "protocol" | "devlog" }) {
  return (
    <nav className="mb-6 flex gap-1 text-sm">
      {active === "protocol" ? (
        <span className="rounded-[2px] bg-white/[0.05] px-3 py-1.5 text-[var(--ink)]">Protocol</span>
      ) : (
        <Link href="/credit/protocol" className="rounded-[2px] px-3 py-1.5 text-[var(--muted)] hover:text-[var(--ink)]">
          Protocol
        </Link>
      )}
      {active === "devlog" ? (
        <span className="rounded-[2px] bg-white/[0.05] px-3 py-1.5 text-[var(--ink)]">Dev log</span>
      ) : (
        <Link href="/credit/protocol/dev-log" className="rounded-[2px] px-3 py-1.5 text-[var(--muted)] hover:text-[var(--ink)]">
          Dev log
        </Link>
      )}
    </nav>
  );
}
