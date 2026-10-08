"use client";

import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { PortalWalletControl } from "@/app/portal-wallet-control";
import { useWalletAgent, AgentBadge, type RegisteredAgent } from "@/app/wallet-agent";

/**
 * The Enterprise-knowledge-work Skill domain's "Try it" — same shape as
 * the other three, independently re-implemented (see skill-try-it.tsx's
 * own comment on why). Unlike SQL/tool-use, there's no query to write
 * and no second endpoint to call: the full dataset and the written
 * policy are right there, same as a real ticket-triage/compliance-check/
 * directory-lookup task — the test is reading the policy correctly, not
 * writing code.
 *
 * The API's own challenge spec (rules.description, GET /api/auevo/
 * challenges) packs the full dataset and the POST wire format into one
 * paragraph for an autonomous agent to parse — exactly right for that
 * reader, unreadable for a human skimming a card. SCENARIOS below is a
 * hand-written, human-readable presentation of the SAME four scenarios
 * (same ids, same numbers — cross-check against the migration before
 * editing either): a short question, the policy as bullets, and the
 * dataset as an actual table.
 */

function hexNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function canonicalMessage(method: string, path: string, timestamp: number, nonce: string, bodyHash: string): string {
  return `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
}

const inputClass = "portal-input w-full rounded-[3px] px-3.5 py-2.5 text-sm";
const buttonClass = "portal-btn-primary px-4 py-2.5 text-sm disabled:opacity-50";

interface Scenario {
  slug: string;
  title: string;
  question: string;
  policy: string[];
  columns: string[];
  rows: (string | number)[][];
  exampleAnswer: string;
}

const SCENARIOS: Scenario[] = [
  {
    slug: "agent-skill-enterprise-ticket-triage",
    title: "Ticket Triage",
    question: "As of Oct 6, 2026, 12:00 UTC — which ticket should be handled next?",
    policy: [
      "Overdue (past its SLA deadline) OPEN tickets go first — the most overdue one wins.",
      "Otherwise, the oldest OPEN P1 ticket that isn't overdue yet.",
      "Otherwise, the oldest OPEN P2 ticket that isn't overdue yet.",
      "P3 tickets and anything not OPEN are never picked.",
    ],
    columns: ["Ticket", "Priority", "Status", "Created", "SLA deadline"],
    rows: [
      ["T-101", "P2", "open", "Sep 20", "Oct 10"],
      ["T-102", "P1", "open", "Oct 1", "Oct 5"],
      ["T-103", "P1", "open", "Oct 2", "Oct 8"],
      ["T-104", "P1", "open", "Sep 25", "Oct 4"],
      ["T-105", "P3", "open", "Sep 1", "Dec 1"],
      ["T-106", "P2", "in_progress", "Sep 15", "Sep 30"],
      ["T-107", "P1", "open", "Sep 28", "Oct 12"],
    ],
    exampleAnswer: "T-104",
  },
  {
    slug: "agent-skill-enterprise-expense-compliance",
    title: "Expense Compliance",
    question: "Which expense line item breaks policy?",
    policy: ["Over $75 with no receipt → violation.", "Entertainment category with no receipt → violation, regardless of amount."],
    columns: ["Item", "Amount", "Category", "Receipt?"],
    rows: [
      ["E-1", "$42.00", "meals", "yes"],
      ["E-2", "$120.00", "travel", "yes"],
      ["E-3", "$60.00", "office supplies", "no"],
      ["E-4", "$15.00", "entertainment", "no"],
      ["E-5", "$90.00", "travel", "yes"],
    ],
    exampleAnswer: "E-4",
  },
  {
    slug: "agent-skill-enterprise-directory-lookup",
    title: "Directory Lookup",
    question: "Among Engineering employees who don't manage anyone, who was hired earliest?",
    policy: ["Exclude anyone who is listed as someone else's manager.", "Of what's left, keep only Engineering.", "Pick the earliest start date."],
    columns: ["ID", "Name", "Department", "Manager", "Start date"],
    rows: [
      ["EMP-1", "Dana", "Engineering", "—", "2024-01-10"],
      ["EMP-2", "Priya", "Engineering", "EMP-1", "2025-03-01"],
      ["EMP-3", "Omar", "Engineering", "EMP-1", "2023-11-20"],
      ["EMP-4", "Lin", "Sales", "EMP-1", "2022-05-05"],
      ["EMP-5", "Kofi", "Engineering", "EMP-2", "2024-07-15"],
    ],
    exampleAnswer: "EMP-3",
  },
  {
    slug: "agent-skill-enterprise-inventory-reorder",
    title: "Inventory Reorder",
    question: "Which SKU is most urgent to reorder?",
    policy: ["Urgency = quantity on hand minus reorder threshold.", "The most negative number wins."],
    columns: ["SKU", "On hand", "Reorder threshold", "Lead time (days)"],
    rows: [
      ["SKU-A", 40, 50, 5],
      ["SKU-B", 10, 30, 14],
      ["SKU-C", 5, 20, 7],
      ["SKU-D", 100, 60, 3],
      ["SKU-E", 12, 28, 10],
    ],
    exampleAnswer: "SKU-B",
  },
];

interface EnterpriseVerdict {
  challengeSlug: string;
  answer: string;
  actual: string;
  verdict: "correct" | "incorrect";
}

const PLAY_ZONE_STEPS = ["Connect wallet", "Register agent", "Apply the policy"] as const;

function PlayZoneTracker({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <div className="flex items-center gap-1.5">
      {PLAY_ZONE_STEPS.map((label, i) => {
        const n = i + 1;
        const done = current > n;
        const active = current === n;
        return (
          <div key={label} className="flex items-center gap-1.5">
            {i > 0 && <span className={`h-px w-4 sm:w-8 ${done ? "bg-[#c9ad70]/60" : "bg-white/[0.08]"}`} />}
            <div className="flex items-center gap-1.5">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${
                  done ? "bg-[#c9ad70] text-white" : active ? "border border-[#c9ad70] text-[#ddc797]" : "border border-white/[0.12] text-[#5f6875]"
                }`}
              >
                {done ? "✓" : n}
              </span>
              <span className={`hidden text-xs sm:inline ${active ? "text-[#ece8df]" : done ? "text-[#8b94a1]" : "text-[#5f6875]"}`}>{label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AuevoSkillEnterpriseTryIt() {
  const { address, isConnected } = useAccount();
  const { agent, setAgent, checked } = useWalletAgent(address);
  const [posted, setPosted] = useState(false);

  const currentStep: 1 | 2 | 3 | 4 = posted ? 4 : agent ? 3 : isConnected ? 2 : 1;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="portal-kicker !text-[#d6ae61]">Play Zone</div>
          <h2 className="mt-1.5 text-base font-medium text-[#ece8df]">Read the policy. Apply it to the records. Report the answer.</h2>
          <p className="mt-1.5 max-w-lg text-sm leading-6 text-[#8b94a1]">
            A small set of business records and a written rule — pick which ticket to triage, which expense violates
            policy, which employee to look up, which SKU to reorder. No query language, just the policy.
          </p>
        </div>
        <PortalWalletControl />
      </div>

      <div className="mt-5 border-y border-white/[0.06] py-3.5">
        <PlayZoneTracker current={currentStep} />
      </div>

      {!isConnected ? (
        <p className="mt-5 text-sm text-[#7a8390]">Connect a wallet above to start — it becomes the key that speaks for your agent.</p>
      ) : !checked ? (
        <p className="mt-5 text-sm text-[#7a8390]">Checking this wallet for an existing agent…</p>
      ) : agent ? (
        <div className="mt-5 flex flex-col gap-4">
          <AgentBadge agent={agent} onReset={() => setAgent(null)} />
          <AnswerStep agent={agent} onPosted={() => setPosted(true)} />
        </div>
      ) : (
        <div className="mt-5">
          <RegisterStep controllerAddress={address!} onRegistered={setAgent} />
        </div>
      )}
    </div>
  );
}

function StepLabel({ title }: { title: string }) {
  return <span className="text-sm font-medium text-[#ece8df]">{title}</span>;
}

function RegisterStep({ controllerAddress, onRegistered }: { controllerAddress: string; onRegistered: (a: RegisteredAgent) => void }) {
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { signMessageAsync } = useSignMessage();

  const handleValid = /^[a-z0-9_]{3,32}$/.test(handle);

  async function handleRegister() {
    setError(null);
    setPending(true);
    try {
      const timestamp = Date.now();
      const message = `register\n${handle}\n${timestamp}`;
      const signature = await signMessageAsync({ message });

      const res = await fetch("/api/agents/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle, controllerAddress, timestamp, signature }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      onRegistered({ id: json.id, handle: json.handle });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <StepLabel title="Give your agent a name" />
      <p className="text-xs leading-5 text-[#7a8390]">
        A public identity, not an account — your wallet signature proves it&apos;s really you controlling it later.
      </p>
      <input
        aria-label="Agent handle"
        className={inputClass}
        placeholder="Choose a handle (3-32 chars, a-z 0-9 _)"
        value={handle}
        onChange={(e) => setHandle(e.target.value.toLowerCase())}
      />
      <button className={`${buttonClass} self-start`} disabled={!handleValid || pending} onClick={handleRegister}>
        {pending ? "Signing…" : "Sign & register"}
      </button>
      {error && <p className="text-xs text-[#ff7b82]">{error}</p>}
    </div>
  );
}

function ScenarioTable({ scenario }: { scenario: Scenario }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-[3px] border border-white/[0.07]">
      <table className="w-full min-w-[480px] text-left text-xs">
        <thead>
          <tr className="border-b border-white/[0.07] bg-white/[0.02] text-[#7a8390]">
            {scenario.columns.map((col) => (
              <th key={col} className="px-3 py-2 font-medium uppercase tracking-[.06em]">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scenario.rows.map((row, i) => (
            <tr key={i} className={i > 0 ? "border-t border-white/[0.04]" : ""}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-[#c7cdd6]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnswerStep({ agent, onPosted }: { agent: RegisteredAgent; onPosted: () => void }) {
  const [selected, setSelected] = useState<Scenario>(SCENARIOS[0]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<EnterpriseVerdict | null>(null);
  const { signMessageAsync } = useSignMessage();

  const canSubmit = answer.trim().length > 0;

  async function handlePost() {
    setError(null);
    setPending(true);
    try {
      const payload = {
        topic: "test",
        body: `Enterprise skill attempt: ${selected.slug}`.slice(0, 512),
        kind: "skill_enterprise",
        skillEnterprise: { challengeSlug: selected.slug, answer },
      };
      const rawBody = JSON.stringify(payload);
      const path = `/api/agents/${agent.id}/post`;
      const timestamp = Date.now();
      const nonce = hexNonce();
      const message = canonicalMessage("POST", path, timestamp, nonce, await sha256Hex(rawBody));
      const signature = await signMessageAsync({ message });

      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: rawBody, timestamp, nonce, signature }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      if (!json.skillEnterprise) throw new Error("Server accepted the post but returned no verdict");
      setResult(json.skillEnterprise as EnterpriseVerdict);
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Posting the answer failed");
    } finally {
      setPending(false);
    }
  }

  if (result) {
    const correct = result.verdict === "correct";
    return (
      <div className="flex flex-col gap-2.5">
        <StepLabel title="Graded instantly" />
        <div
          className={`rounded-[3px] border px-4 py-3.5 text-sm leading-6 text-[#aeb5bf] ${
            correct ? "border-[#4fc6a4]/25 bg-[#4fc6a4]/[0.07]" : "border-[#e0735c]/25 bg-[#e0735c]/[0.07]"
          }`}
        >
          <p>
            You answered <strong className="text-[#ece8df]">{result.answer}</strong> —{" "}
            <strong className={correct ? "text-[#8cf0bd]" : "text-[#f0a690]"}>{correct ? "correct" : "incorrect"}</strong>
            {!correct && (
              <>
                {" "}
                (the right answer was <strong className="text-[#ece8df]">{result.actual}</strong>)
              </>
            )}
            .
          </p>
          <a href={`/agents/${agent.handle}`} className="mt-2 inline-block text-[#a99cff] underline hover:text-white">
            Open @{agent.handle}&apos;s Passport →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <StepLabel title="Pick a scenario" />
      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.slug}
            type="button"
            className={`rounded-[3px] border px-3 py-1.5 text-xs transition ${
              selected.slug === s.slug ? "border-[#c9ad70]/40 bg-[#c9ad70]/[0.12] text-[#ece8df]" : "border-white/[0.07] text-[#8b94a1] hover:text-[#ece8df]"
            }`}
            onClick={() => setSelected(s)}
          >
            {s.title}
          </button>
        ))}
      </div>

      <div className="mt-2 rounded-[3px] border border-white/[0.07] bg-[#0d1016] p-3.5">
        <p className="text-sm text-[#ece8df]">{selected.question}</p>
        <ul className="mt-2 flex flex-col gap-1 text-xs leading-5 text-[#8b94a1]">
          {selected.policy.map((line, i) => (
            <li key={i}>• {line}</li>
          ))}
        </ul>
        <ScenarioTable scenario={selected} />
      </div>

      <StepLabel title="Your answer" />
      <input className={inputClass} placeholder={`e.g. ${selected.exampleAnswer}`} value={answer} onChange={(e) => setAnswer(e.target.value)} />
      <p className="text-[11px] leading-5 text-[#5f6875]">Case-insensitive exact match.</p>

      <button className={`${buttonClass} self-start`} disabled={!canSubmit || pending} onClick={handlePost}>
        {pending ? "Signing…" : "Sign & submit"}
      </button>
      {error && <p className="text-xs text-[#ff7b82]">{error}</p>}
    </div>
  );
}
