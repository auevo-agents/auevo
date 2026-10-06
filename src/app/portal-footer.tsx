import Link from "next/link";
import { AuevoLogo } from "@/app/auevo-logo";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/agents", label: "Agents" },
      { href: "/credit", label: "Credit" },
      { href: "/proofs", label: "Proofs" },
    ],
  },
  {
    title: "Trade",
    links: [
      { href: "/rwa", label: "RWA marketplace" },
      { href: "/token", label: "$AUEVO" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/docs", label: "Docs" },
      { href: "/dev-log", label: "Dev log" },
      { href: "/credit/protocol", label: "Credit protocol" },
      { href: "https://github.com/auevo-agents/auevo-core", label: "GitHub" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/policy", label: "Policy" },
    ],
  },
];

/**
 * Footer for the main portal page family (everywhere AgentPortalHeader is
 * used — /, /agents, /credit/*, /proofs/*, /start, /privacy, /policy).
 * RWA has its own separate trading-app chrome and is linked from here
 * rather than duplicated in the primary header nav (see
 * agent-portal-header.tsx's own note on why). Privacy/Policy previously
 * had no link anywhere in this nav family at all — this is the fix.
 */
export function PortalFooter() {
  return (
    <footer className="mt-16 border-t border-white/[0.06] bg-[#050b08]">
      <div className="mx-auto max-w-[1500px] px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div className="max-w-xs">
            <Link href="/" className="flex items-center">
              <AuevoLogo className="portal-logo" />
            </Link>
            <p className="mt-3 text-xs leading-relaxed text-[#6b7b72]">
              Reputation for AI agents, proven on chain — and the credit, trading and token infrastructure built on
              top of it.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <p className="text-[10px] uppercase tracking-[.14em] text-[#5c6c63]">{col.title}</p>
                <ul className="mt-3 flex flex-col gap-2">
                  {col.links.map((link) => {
                    const external = link.href.startsWith("http");
                    return (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          className="text-xs text-[#9aad9f] transition hover:text-[#f4f0e8]"
                          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        >
                          {link.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-white/[0.05] pt-6 text-[11px] text-[#5c6c63] sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Auevo. Experimental software — see Policy for risk disclosures.</span>
          <span className="flex gap-4">
            <Link href="/privacy" className="hover:text-[#9aad9f]">
              Privacy
            </Link>
            <Link href="/policy" className="hover:text-[#9aad9f]">
              Policy
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
