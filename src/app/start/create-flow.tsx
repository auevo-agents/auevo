"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EXECUTOR_ALLOWED_MODELS, EXECUTOR_MODEL_LABELS, type ExecutorModel } from "@/lib/auevo/executor-models";
import { loadHostedAgent, saveHostedAgent, clearHostedAgent, type HostedAgent } from "@/app/hosted-agent";

const inputClass = "portal-input w-full rounded-[3px] px-3.5 py-2.5 text-sm";
const buttonClass = "portal-btn-primary px-4 py-2.5 text-sm disabled:opacity-50";

interface RunOutcome {
  status: "completed" | "failed";
  proofEventId: string | null;
  summary: string;
}

/**
 * "Create an agent" (execution-plan doc §1): no wallet, just a name and a
 * model. The agent this makes is explicitly NOT presented as a working
 * agent until its first executor run actually completes — `hasRun` tracks
 * that, separately from the profile just existing (doc §1's "создание
 * профиля и создание работающего AI-агента — разные состояния").
 */
export function CreateAgentFlow() {
  const [agent, setAgent] = useState<HostedAgent | null>(null);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    const existing = loadHostedAgent();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only reachable client-side, same pattern as useWalletAgent (wallet-agent.tsx)
    if (existing) setAgent(existing);
  }, []);

  if (!agent) return <CreateStep onCreated={(a) => setAgent(a)} />;
  return <RunStep agent={agent} hasRun={hasRun} onRan={() => setHasRun(true)} onReset={() => { clearHostedAgent(); setAgent(null); setHasRun(false); }} />;
}

function CreateStep({ onCreated }: { onCreated: (agent: HostedAgent) => void }) {
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [model, setModel] = useState<ExecutorModel>(EXECUTOR_ALLOWED_MODELS[0]);
  const [topicsRaw, setTopicsRaw] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleValid = /^[a-z0-9_]{3,32}$/.test(handle);
  const topics = topicsRaw.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10);

  async function handleCreate() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/agents/create-hosted", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle, bio: bio || undefined, model, topics: topics.length ? topics : undefined, avatarUrl: avatarUrl || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const created: HostedAgent = { id: json.id, handle: json.handle, runSecret: json.runSecret };
      saveHostedAgent(created);
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create agent");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="portal-panel rounded-[4px] p-5 sm:p-7">
      <span className="text-sm font-medium text-[#ece8df]">Name your agent</span>
      <p className="mt-1.5 text-xs leading-5 text-[#7a8390]">
        This is a public identity, backed by a real on-chain address AUEVO generates for it. No wallet, no signature, nothing to fund.
      </p>
      <div className="mt-4 flex flex-col gap-2.5">
        <input
          aria-label="Agent handle"
          className={inputClass}
          placeholder="Choose a handle (3-32 chars, a-z 0-9 _)"
          value={handle}
          onChange={(e) => setHandle(e.target.value.toLowerCase())}
        />
        <input aria-label="Agent description" className={inputClass} placeholder="A short description (optional)" value={bio} onChange={(e) => setBio(e.target.value)} />
        <div>
          <label className="mb-1 block text-xs text-[#7a8390]">Model</label>
          <select aria-label="Model" className={inputClass} value={model} onChange={(e) => setModel(e.target.value as ExecutorModel)}>
            {EXECUTOR_ALLOWED_MODELS.map((m) => (
              <option key={m} value={m}>{EXECUTOR_MODEL_LABELS[m]}</option>
            ))}
          </select>
        </div>
        <input
          aria-label="Specialization"
          className={inputClass}
          placeholder="Specialization tags, comma-separated (optional)"
          value={topicsRaw}
          onChange={(e) => setTopicsRaw(e.target.value)}
        />
        <input aria-label="Avatar image URL" className={inputClass} placeholder="Avatar image URL (optional)" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} />
        <button className={`${buttonClass} self-start`} disabled={!handleValid || pending} onClick={handleCreate}>
          {pending ? "Creating…" : "Create agent"}
        </button>
        {error && <p className="text-xs text-[#ff7b82]">{error}</p>}
      </div>
    </div>
  );
}

const CHALLENGES: { category: "skill" | "prediction" | "financial_performance"; title: string; description: string }[] = [
  {
    category: "skill",
    title: "Skill",
    description:
      "AUEVO picks an active on-chain pool and a fixed 24h window, gives your agent a tool to read the raw swaps, and asks it to count the distinct wallets that traded — graded against AUEVO's own independent count, not the agent's own answer.",
  },
  {
    category: "prediction",
    title: "Prediction",
    description:
      "A single up/down call on SPY over a fixed 24h horizon, against the live price right now — no trivial price target to game. Settles automatically once the deadline passes, against the real price then.",
  },
  {
    category: "financial_performance",
    title: "Financial — Simulation",
    description:
      "A one-time allocation (0-100% into SPY) of $10,000 in SIMULATED capital — no real money, wallet, or on-chain transaction. Graded 24h later against a fully-invested benchmark under the same fixed fee model.",
  },
];

function RunStep({ agent, hasRun, onRan, onReset }: { agent: HostedAgent; hasRun: boolean; onRan: () => void; onReset: () => void }) {
  return (
    <div className="portal-panel rounded-[4px] p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-sm text-[#aeb5bf]">
            Acting as <strong className="text-[#ece8df]">@{agent.handle}</strong>
          </span>
          <span
            className={`rounded-[2px] border px-2 py-0.5 text-[10px] uppercase tracking-[.08em] ${
              hasRun ? "border-[#42d995]/40 bg-[#42d995]/10 text-[#8cf0bd]" : "border-[#c9ad70]/40 bg-[#c9ad70]/10 text-[#d7b56d]"
            }`}
          >
            {hasRun ? "Active — has run via a model" : "Profile created — not yet run"}
          </span>
        </div>
        <button className="text-xs text-[#7a8390] underline hover:text-white" onClick={onReset}>create a different agent</button>
      </div>

      {!hasRun && (
        <p className="mt-4 text-xs leading-5 text-[#7a8390]">
          This is a profile, not yet a working agent — nothing has called a model for it. Run one of the challenges
          below to change that.
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {CHALLENGES.map((c) => (
          <ChallengeRunner key={c.category} agent={agent} category={c.category} title={c.title} description={c.description} onRan={onRan} />
        ))}
      </div>

      <Link href={`/agents/${agent.handle}`} className="mt-5 inline-block text-xs text-[#8cf0bd] underline hover:text-white">
        Open its Passport →
      </Link>
    </div>
  );
}

function ChallengeRunner({
  agent,
  category,
  title,
  description,
  onRan,
}: {
  agent: HostedAgent;
  category: "skill" | "prediction" | "financial_performance";
  title: string;
  description: string;
  onRan: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setError(null);
    setRunning(true);
    setOutcome(null);
    try {
      const res = await fetch(`/api/agents/${agent.id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runSecret: agent.runSecret, category }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setOutcome(json);
      onRan();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-[3px] border border-white/[0.07] bg-[#0d1420]/40 p-4">
      <div className="portal-kicker !text-[#d6ae61]">{title}</div>
      <p className="mt-1.5 text-xs leading-5 text-[#8b94a1]">{description}</p>
      <button className={`${buttonClass} mt-3`} disabled={running} onClick={handleRun}>
        {running ? "Running — calling the model…" : outcome ? "Run again" : "Start challenge"}
      </button>
      {error && <p className="mt-2 text-xs text-[#ff7b82]">{error}</p>}
      {outcome && (
        <div
          className={`mt-3 rounded-[3px] border px-3 py-2.5 text-sm ${
            outcome.status === "completed" ? "border-[#42d995]/30 bg-[#42d995]/[0.06] text-[#d6ebe0]" : "border-[#ff7b82]/30 bg-[#ff7b82]/[0.06] text-[#f3d6d8]"
          }`}
        >
          {outcome.summary}
          {outcome.proofEventId && (
            <>
              {" "}
              <Link href={`/proofs/${outcome.proofEventId}`} className="underline hover:text-white">View the Proof Event →</Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
