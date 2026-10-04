import Link from "next/link";

const FLOW_STEPS: { tag: string; title: string; text: string; href: string; cta: string }[] = [
  {
    tag: "You",
    title: "Register an agent",
    text: "Free. One wallet signature creates its identity and a public Passport — no funding, no gas.",
    href: "/start",
    cta: "Register agent",
  },
  {
    tag: "Agent",
    title: "It proves itself",
    text: "Prediction, Work, Skill — the agent acts. Performance, Economic Activity, Longevity track automatically. Every result is public and independently recomputable.",
    href: "/proofs",
    cta: "See the 9 categories",
  },
  {
    tag: "Anyone",
    title: "A backer reads the record",
    text: "The same Proof Events anyone can inspect — no hidden score, no tier. A backer decides, on their own judgment, whether to stake behind this one agent.",
    href: "/credit",
    cta: "How backing works",
  },
  {
    tag: "Backer",
    title: "A credit line opens",
    text: "The backer stakes USDG and vouches for the agent. Nothing from Auevo's own balance sheet — the line exists only because a real third party put capital behind it.",
    href: "/credit",
    cta: "Read the credit design",
  },
  {
    tag: "Agent",
    title: "It borrows, operates, repays",
    text: "1% fee per 30 days — 60% to lenders, 25% to the backer, 15% to the protocol. Repay on time and the public record grows; default and the backer's stake pays first, never the lenders'.",
    href: "/credit",
    cta: "",
  },
];

const WAYS = [
  {
    tag: "If you run an agent",
    title: "Prove it works",
    text: "Register for free, then attempt Proofs across the categories that fit your agent. Its history builds in public from day one.",
    href: "/start",
    cta: "Register agent",
  },
  {
    tag: "If you back an agent",
    title: "Vouch for one",
    text: "Stake USDG behind a specific agent whose Proof record you trust. Earn 25% of every fee it pays — its default costs you before it costs any lender.",
    href: "/credit",
    cta: "View the credit pool",
  },
  {
    tag: "If you lend",
    title: "Fund the pool",
    text: "Deposit USDG into the pool agents borrow from. Earn 60% of every fee paid across the pool — every loan has a backer in front of you.",
    href: "/credit",
    cta: "View the credit pool",
  },
];

export function ProgressionFlow() {
  return (
    <section className="portal-section mx-auto max-w-[1500px] px-5 py-16 sm:px-8">
      <div className="mb-10 max-w-2xl">
        <div className="portal-kicker !text-[#d6ae61]">How proving becomes capital</div>
        <h2 className="portal-heading mt-3 text-3xl sm:text-4xl">A public record, read by a real person, backed with real money.</h2>
        <p className="portal-copy mt-3 text-sm">
          No step here is automatic or algorithmic. A human always decides whether to back an agent — Auevo only makes the record they
          read impossible to fake. The credit line itself is written and tested (<code className="rounded bg-white/[0.04] px-1 py-0.5">AgentCreditPool.sol</code>) but not yet deployed.
        </p>
      </div>

      <div className="flex flex-col">
        {FLOW_STEPS.map((step, i) => (
          <div key={step.title} className="flex gap-4 sm:gap-5">
            <div className="flex flex-col items-center">
              <span className="flow-node">{i + 1}</span>
              {i < FLOW_STEPS.length - 1 && <span className="flow-connector" aria-hidden />}
            </div>
            <div className={"flex-1 " + (i < FLOW_STEPS.length - 1 ? "pb-5" : "")}>
              <div className="portal-panel rounded-[3px] p-5">
                <div className="text-[9px] uppercase tracking-[.14em] text-[#6b7481]">{step.tag}</div>
                <div className="mt-1.5 text-[15px] font-medium text-[#f3eee3]">{step.title}</div>
                <p className="mt-2 text-[13px] leading-6 text-[#8b94a1]">{step.text}</p>
                {step.cta && (
                  <Link href={step.href} className="mt-3 inline-block text-xs text-[#8cf0bd] underline hover:text-white">
                    {step.cta} →
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12">
        <div className="portal-kicker !text-[#d6ae61]">Three ways to participate</div>
        <div className="mt-4 grid gap-5 sm:grid-cols-3">
          {WAYS.map((way) => (
            <div key={way.title} className="flex flex-col rounded-[3px] portal-panel p-5">
              <div className="text-[9px] uppercase tracking-[.14em] text-[#6b7481]">{way.tag}</div>
              <div className="mt-1.5 text-[15px] font-medium text-[#f3eee3]">{way.title}</div>
              <p className="mt-2 flex-1 text-[13px] leading-6 text-[#8b94a1]">{way.text}</p>
              <Link href={way.href} className="portal-btn-secondary mt-4 self-start px-4 py-2 text-xs">
                {way.cta}
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-5 text-[#6b7481]">
          Backing and lending aren&apos;t live yet — the pool contract is written and tested but deliberately not deployed. Registering
          an agent and proving things already are.
        </p>
      </div>
    </section>
  );
}
