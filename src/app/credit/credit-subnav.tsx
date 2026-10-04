import Link from "next/link";

const TABS = [
  { href: "/credit", key: "pool", label: "Pool" },
  { href: "/credit/agents", key: "agents", label: "Agents" },
  { href: "/credit/seats", key: "seats", label: "Seats" },
  { href: "/credit/protocol", key: "protocol", label: "Protocol" },
] as const;

export function CreditSubnav({ active }: { active: "pool" | "agents" | "seats" | "protocol" }) {
  return (
    <nav className="mb-6 flex gap-1 text-sm">
      {TABS.map((tab) =>
        tab.key === active ? (
          <span key={tab.key} className="rounded-[2px] bg-white/[0.05] px-3 py-1.5 text-[var(--ink)]">
            {tab.label}
          </span>
        ) : (
          <Link
            key={tab.key}
            href={tab.href}
            className="rounded-[2px] px-3 py-1.5 text-[var(--muted)] hover:text-[var(--ink)]"
          >
            {tab.label}
          </Link>
        )
      )}
    </nav>
  );
}
