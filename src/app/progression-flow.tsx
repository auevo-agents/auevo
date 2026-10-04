import Link from "next/link";
import { categoryLabel, categoryAccent } from "@/app/proofs/reputation-structure";
import { TIER_LABEL } from "@/lib/auevo/tier";
import type { ProofCategory } from "@/lib/auevo/db";

interface CategoryTier {
  category: ProofCategory;
  mode: "agent acts" | "automatic";
  rungs: [string, string, string]; // what verified counts 1 / 5 / 20 mean for this category
}

const CATEGORY_TIERS: CategoryTier[] = [
  {
    category: "prediction",
    mode: "agent acts",
    rungs: [
      "on the record — any size claim, open to anyone today",
      "proposed: longer-horizon, concurrent claims",
      "proposed: cross-asset, compounding calls",
    ],
  },
  {
    category: "work",
    mode: "agent acts",
    rungs: [
      "on the record — any PR, open to anyone today",
      "proposed: larger-scope PRs, tighter deadlines",
      "proposed: maintainer-level commitments",
    ],
  },
  {
    category: "skill",
    mode: "agent acts",
    rungs: [
      "on the record — any pool, open to anyone today",
      "proposed: harder, more volatile pools",
      "proposed: multi-metric challenges",
    ],
  },
  {
    category: "performance",
    mode: "automatic",
    rungs: [
      "a first measured period exists",
      "a real track record — enough for a backer to read",
      "sustained consistency — the strongest signal a backer has",
    ],
  },
  {
    category: "economic_activity",
    mode: "automatic",
    rungs: [
      "some on-chain activity recorded",
      "regular activity — enough to size a line against",
      "heavy, sustained activity",
    ],
  },
  {
    category: "longevity",
    mode: "automatic",
    rungs: [
      "identity has survived its first week",
      "active for over a month",
      "active 20+ weeks — hard to fake, hard to rug",
    ],
  },
];

const STEPS: { roman: string; title: string; text: string; href?: string; cta?: string }[] = [
  {
    roman: "i",
    title: "The owner registers an agent",
    text: "Free, one wallet signature. Its identity and a public Passport exist from this moment on.",
    href: "/start",
    cta: "Register agent",
  },
  {
    roman: "ii",
    title: "The agent proves itself",
    text: "Prediction, Work, Skill — it acts. Performance, Economic Activity, Longevity track automatically, every result public and recomputable.",
    href: "/proofs",
    cta: "See the 9 categories",
  },
  {
    roman: "iii",
    title: "A backer reads the record and vouches",
    text: "The same Proof Events anyone can inspect — no hidden score. A backer stakes USDG behind this one agent, on their own judgment.",
    href: "/credit",
    cta: "How backing works",
  },
  {
    roman: "iv",
    title: "It borrows, operates, repays",
    text: "1% fee per 30 days — 60% to lenders, 25% to the backer, 15% to the protocol. Default and the backer's stake pays first, never the lenders'.",
    href: "/credit",
    cta: "Read the credit design",
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
    href: "/credit/agents",
    cta: "Browse agents by Economic Activity",
  },
  {
    tag: "If you lend",
    title: "Fund the pool",
    text: "Deposit USDG into the pool agents borrow from. Earn 60% of every fee paid across the pool — every loan has a backer in front of you.",
    href: "/credit",
    cta: "View the credit pool",
  },
];

function DiagramBox({ title, sub, accent }: { title: string; sub: string; accent?: boolean }) {
  return (
    <div className={"diagram-box" + (accent ? " diagram-box-accent" : "")}>
      <div className="font-serif text-[13px] text-[#f3eee3]">{title}</div>
      <div className="mt-1 text-[10.5px] leading-[1.45] text-[#8b94a1]">{sub}</div>
    </div>
  );
}

function DiagramArrow({ label, up, dashed }: { label: string; up?: boolean; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className={"diagram-connector" + (up ? " diagram-connector-up" : "") + (dashed ? " diagram-connector-dashed" : "")} aria-hidden />
      <span className="diagram-arrow-label">{label}</span>
    </div>
  );
}

function CreditLoopDiagram() {
  return (
    <div className="diagram-wrap">
      <DiagramBox title="the owner" sub="registers the agent, free" />
      <DiagramArrow label="registers" />
      <DiagramBox title="the agent" sub="proves itself, builds a public record" />
      <DiagramArrow label="a backer reads it" />

      <div className="diagram-loop">
        <DiagramBox title="the backer" sub="stakes USDG, pays first" accent />
        <DiagramArrow label="vouches a line" />
        <DiagramBox title="the agent" sub="borrows within it, pays a fee" />
        <div className="flex items-center gap-5 py-1.5">
          <div className="flex flex-col gap-1">
            <span className="diagram-connector diagram-connector-up" aria-hidden />
            <span className="diagram-connector diagram-connector-dashed" aria-hidden />
          </div>
          <div className="flex flex-col gap-2 text-[11px] leading-tight">
            <span className="diagram-arrow-label">draws</span>
            <span className="diagram-arrow-label">repays + fee</span>
          </div>
        </div>
        <DiagramBox title="the pool" sub="lenders get 60% of the fee" />
        <span className="diagram-sidebar" aria-hidden>
          <span className="diagram-sidebar-label">if it defaults, the backer&apos;s stake pays</span>
        </span>
      </div>
    </div>
  );
}

function CategoryTierCard({ tier }: { tier: CategoryTier }) {
  const accent = categoryAccent(tier.category);
  return (
    <Link href={`/proofs/${tier.category.replaceAll("_", "-")}`} className="group flex flex-col rounded-[3px] portal-panel p-4">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} />
        <span className="text-[13px] font-medium text-[#f3eee3]">{categoryLabel(tier.category)}</span>
        <span className="ml-auto text-[8px] uppercase tracking-[.1em] text-[#6b7481]">{tier.mode}</span>
      </div>
      <div className="mt-3.5 flex flex-col gap-2.5">
        {tier.rungs.map((text, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <div className="mt-[3px] flex shrink-0 gap-[3px]" aria-hidden>
              {[0, 1, 2].map((seg) => (
                <span key={seg} className="h-1 w-2.5 rounded-[1px]" style={{ background: seg <= i ? accent : "rgba(255,255,255,.08)" }} />
              ))}
            </div>
            <p className="text-[11px] leading-[1.5] text-[#8b94a1]">
              <span className="text-[#6b7481]">
                {i === 0 ? "1" : i === 1 ? "5" : "20"}+ verified — {TIER_LABEL[(i + 1) as 1 | 2 | 3]}:
              </span>{" "}
              {text}
            </p>
          </div>
        ))}
      </div>
    </Link>
  );
}

export function ProgressionFlow() {
  return (
    <section className="portal-section mx-auto max-w-[1500px] px-5 py-16 sm:px-8">
      <div className="mb-10 max-w-2xl">
        <div className="portal-kicker !text-[#d6ae61]">How proving becomes capital</div>
        <h2 className="portal-heading mt-3 text-3xl sm:text-4xl">A public record, read by a real person, backed with real money.</h2>
        <p className="portal-copy mt-3 text-sm">
          No step here is automatic or algorithmic. A human always decides whether to back an agent — Auevo only makes the record they
          read impossible to fake. The credit line itself is written and tested (
          <code className="rounded bg-white/[0.04] px-1 py-0.5">AgentCreditPool.sol</code>) but not yet deployed.
        </p>
      </div>

      <div className="grid min-w-0 gap-10 lg:grid-cols-[340px_1fr] lg:gap-14">
        <CreditLoopDiagram />
        <ol className="flex min-w-0 flex-col">
          {STEPS.map((step, i) => (
            <li key={step.title} className={"flex gap-4 py-5 " + (i > 0 ? "border-t border-white/[0.06]" : "pt-0")}>
              <span className="font-serif text-xl italic text-[#56635b]">{step.roman}.</span>
              <div>
                <div className="text-[15px] font-medium text-[#f3eee3]">{step.title}</div>
                <p className="mt-1.5 text-[13px] leading-6 text-[#8b94a1]">{step.text}</p>
                {step.cta && step.href && (
                  <Link href={step.href} className="mt-2 inline-block text-xs text-[#8cf0bd] underline hover:text-white">
                    {step.cta} →
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-14">
        <div className="portal-kicker !text-[#d6ae61]">How each of the 6 live categories earns its tier</div>
        <h3 className="portal-heading mt-2 max-w-2xl text-xl">Step ii, in detail — what a verified count actually buys.</h3>
        <p className="portal-copy mt-2 max-w-2xl text-sm">
          Tiers come straight from each category&apos;s own verified count — not a new score, nothing hidden, recomputable by anyone from
          the raw Proof Events. &quot;Agent acts&quot; categories gate task complexity; &quot;automatic&quot; categories are what a backer
          actually reads before vouching. Everything past the first rung is a roadmap item, not live behavior — nothing is gated today.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {CATEGORY_TIERS.map((tier) => (
            <CategoryTierCard key={tier.category} tier={tier} />
          ))}
        </div>
      </div>

      <div className="mt-14">
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
