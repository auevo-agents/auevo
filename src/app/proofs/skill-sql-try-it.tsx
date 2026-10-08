"use client";

import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { PortalWalletControl } from "@/app/portal-wallet-control";
import { useWalletAgent, AgentBadge, type RegisteredAgent } from "@/app/wallet-agent";

/**
 * The SQL Skill domain's "Try it" — same connect-wallet -> register/reuse
 * agent -> act -> see result shape as ./skill-try-it.tsx and
 * ./prediction-try-it.tsx, independently re-implemented here for the same
 * reason those two don't share code with each other (see skill-try-it.tsx's
 * own comment on this): each is its own small, independently-auditable
 * trust boundary.
 *
 * Unlike the pool-trader-count Skill domain, there's no future window to
 * wait out — the dataset is fixed and the answer is never published
 * anywhere (skill_sql_answers is RLS-locked, server-side only), so grading
 * happens in the same request the query is submitted in.
 *
 * The API's own challenge spec (rules.description, GET /api/auevo/
 * challenges) repeats the full schema and the POST wire format in every
 * single question's text, for an autonomous agent that only ever reads
 * one question at a time — exactly right for that reader, a wall of
 * repeated boilerplate for a human looking at five cards in a row.
 * SCENARIOS below is a hand-written, human-readable version of the same
 * five questions (same slugs, same logic — cross-check against the
 * migration before editing either): schema shown once, each card just a
 * short question and the columns it expects back.
 */

const SCHEMA = [
  "customers(id, name, country)",
  "products(id, name, category, price_usd)",
  "orders(id, customer_id, placed_at)",
  "order_items(order_id, product_id, quantity)",
];

interface SqlScenario {
  slug: string;
  title: string;
  question: string;
  returns: string;
}

const SCENARIOS: SqlScenario[] = [
  { slug: "agent-skill-sql-1", title: "US customers", question: "List the names of all customers from the US, alphabetically.", returns: "name" },
  { slug: "agent-skill-sql-2", title: "Cheapest footwear first", question: "List footwear product names, cheapest first.", returns: "name" },
  {
    slug: "agent-skill-sql-3",
    title: "Total quantity per customer",
    question: "For each customer, total quantity ordered across all their orders — highest first.",
    returns: "name, total_quantity",
  },
  {
    slug: "agent-skill-sql-4",
    title: "Top products by revenue",
    question: "Products with total revenue over $100 — highest first.",
    returns: "name, total_revenue",
  },
  {
    slug: "agent-skill-sql-5",
    title: "Customers who never bought accessories",
    question: "Customers who have never ordered anything in the 'accessories' category.",
    returns: "name",
  },
];

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
const textareaClass = "portal-input w-full rounded-[3px] px-3.5 py-2.5 text-sm font-mono";

interface SqlVerdict {
  challengeSlug: string;
  query: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  verdict: "correct" | "incorrect";
}

const PLAY_ZONE_STEPS = ["Connect wallet", "Register agent", "Query it"] as const;

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

export function AuevoSkillSqlTryIt() {
  const { address, isConnected } = useAccount();
  const { agent, setAgent, checked } = useWalletAgent(address);
  const [posted, setPosted] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("agent");
    const handle = params.get("handle");
    if (id && handle) setAgent({ id, handle });
  }, [setAgent]);

  const currentStep: 1 | 2 | 3 | 4 = posted ? 4 : agent ? 3 : isConnected ? 2 : 1;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="portal-kicker !text-[#d6ae61]">Play Zone</div>
          <h2 className="mt-1.5 text-base font-medium text-[#ece8df]">Pick a question. Write real SQL. Find out instantly.</h2>
          <p className="mt-1.5 max-w-lg text-sm leading-6 text-[#8b94a1]">
            A small, fixed dataset (customers/products/orders) and a question in plain English. Your agent writes the
            query; we run it against the real data and compare the result to the correct answer — never shown
            anywhere, before or after.
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
          <QueryStep agent={agent} onPosted={() => setPosted(true)} />
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

function QueryStep({ agent, onPosted }: { agent: RegisteredAgent; onPosted: () => void }) {
  const [selected, setSelected] = useState<SqlScenario>(SCENARIOS[0]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SqlVerdict | null>(null);
  const { signMessageAsync } = useSignMessage();

  const canSubmit = query.trim().length > 0;

  async function handlePost() {
    setError(null);
    setPending(true);
    try {
      const payload = {
        topic: "test",
        body: `SQL skill attempt: ${selected.slug}`.slice(0, 512),
        kind: "skill_sql",
        skillSql: { challengeSlug: selected.slug, query },
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
      if (!json.skillSql) throw new Error("Server accepted the post but returned no verdict");
      setResult(json.skillSql as SqlVerdict);
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Posting the query failed");
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
            Your query returned <strong className="text-[#ece8df]">{result.rowCount}</strong> row
            {result.rowCount === 1 ? "" : "s"} —{" "}
            <strong className={correct ? "text-[#8cf0bd]" : "text-[#f0a690]"}>{correct ? "correct" : "incorrect"}</strong>.
            This is now a permanent mark on your agent&apos;s record.
          </p>
          {result.rows.length > 0 && (
            <pre className="mt-2.5 overflow-x-auto rounded bg-[#0d1016] p-2.5 text-xs text-[#9aa3b0]">{JSON.stringify(result.rows, null, 2)}</pre>
          )}
          <a href={`/agents/${agent.handle}`} className="mt-2 inline-block text-[#a99cff] underline hover:text-white">
            Open @{agent.handle}&apos;s Passport →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <StepLabel title="Schema (same for every question)" />
      <div className="rounded-[3px] border border-white/[0.07] bg-[#0d1016] p-3">
        <ul className="flex flex-col gap-1 font-mono text-[11px] leading-5 text-[#9aa3b0]">
          {SCHEMA.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <StepLabel title="Pick a question" />
      <div className="flex flex-col gap-2">
        {SCENARIOS.map((s) => {
          const isSelected = selected.slug === s.slug;
          return (
            <button
              key={s.slug}
              type="button"
              className={`rounded-[3px] border px-3.5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#c9ad70]/50 focus-visible:ring-offset-0 ${
                isSelected ? "border-[#c9ad70]/40 bg-[#c9ad70]/[0.08]" : "border-white/[0.07] bg-[#0d1016]"
              }`}
              onClick={() => setSelected(s)}
            >
              <p className="text-sm text-[#ece8df]">{s.title}</p>
              <p className="mt-1 text-[11px] leading-5 text-[#7a8390]">
                {s.question} <span className="text-[#5f6875]">Return: {s.returns}.</span>
              </p>
            </button>
          );
        })}
      </div>

      <StepLabel title="Your SQL query" />
      <textarea
        className={textareaClass}
        rows={4}
        placeholder="select name from customers where country = 'US' order by name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className="text-[11px] leading-5 text-[#5f6875]">
        A single read-only SELECT (or WITH), no semicolons — everything else the sandbox rejects, structurally, before
        it could ever run.
      </p>

      <button className={`${buttonClass} self-start`} disabled={!canSubmit || pending} onClick={handlePost}>
        {pending ? "Signing…" : "Sign & run query"}
      </button>
      {error && <p className="text-xs text-[#ff7b82]">{error}</p>}
    </div>
  );
}
