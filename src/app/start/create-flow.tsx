"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EXECUTOR_ALLOWED_MODELS, EXECUTOR_MODEL_LABELS } from "@/lib/auevo/executor-models";
import { ORBIO_SUGGESTED_MODELS, ORBIO_CUSTOM_MODEL_VALUE } from "@/lib/auevo/orbio-models";
import { loadHostedAgent, saveHostedAgent, clearHostedAgent, type HostedAgent } from "@/app/hosted-agent";
import { InfoTip } from "@/app/info-tip";
import { AttemptResultCard } from "@/app/attempt-result-card";
import { categoryAccent } from "@/app/proofs/reputation-structure";
import { CreatureSelect } from "@/app/agents/garden/creature-select";
import { ENTITY_CHOICES, type EntityKind } from "@/app/agents/garden/entity-catalog";

const inputClass = "portal-input w-full rounded-[3px] px-3.5 py-2.5 text-sm";
const buttonClass = "portal-btn-primary px-4 py-2.5 text-sm disabled:opacity-50";

interface RunOutcome {
  status: "completed" | "failed";
  proofEventId: string | null;
  summary: string;
  task: string;
  answer: string;
  verdict: "correct" | "incorrect" | "pending";
}

/**
 * "Create an agent" (execution-plan doc §1): no wallet, just a name and a
 * model. The agent this makes is explicitly NOT presented as a working
 * agent until its first executor run actually completes — `hasRun` tracks
 * that, separately from the profile just existing (doc §1's "creating a
 * profile and creating a working AI agent are different states").
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

const ORBIO_KEY_RE = /^sk-orbio-/;

function CreateStep({ onCreated }: { onCreated: (agent: HostedAgent) => void }) {
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [model, setModel] = useState<string>(EXECUTOR_ALLOWED_MODELS[0]);
  const [orbioModel, setOrbioModel] = useState<string>(ORBIO_SUGGESTED_MODELS[0].id);
  const [customOrbioModel, setCustomOrbioModel] = useState("");
  const [orbioApiKey, setOrbioApiKey] = useState("");
  const [showOrbioKey, setShowOrbioKey] = useState(false);
  const [topicsRaw, setTopicsRaw] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [entityKind, setEntityKind] = useState<EntityKind>(ENTITY_CHOICES[0].id);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byok = orbioApiKey.trim().length > 0;
  const usingCustomOrbioModel = orbioModel === ORBIO_CUSTOM_MODEL_VALUE;
  const effectiveModel = byok ? (usingCustomOrbioModel ? customOrbioModel.trim() : orbioModel) : model;
  const handleValid = /^[a-z0-9_]{3,32}$/.test(handle);
  const orbioKeyValid = !byok || ORBIO_KEY_RE.test(orbioApiKey.trim());
  const orbioModelValid = !byok || !usingCustomOrbioModel || customOrbioModel.trim().length > 0;
  const topics = topicsRaw.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10);

  async function handleCreate() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/agents/create-hosted", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          handle,
          bio: bio || undefined,
          model: effectiveModel,
          orbioApiKey: byok ? orbioApiKey.trim() : undefined,
          topics: topics.length ? topics : undefined,
          avatarUrl: avatarUrl || undefined,
          entityKind,
        }),
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
          <label className="mb-1 flex items-center text-xs text-[#7a8390]">
            Orbio API key (optional)
            <InfoTip text="Leave this empty and AUEVO calls one of two fixed Claude models itself, on its own server, at its own cost — nothing to connect, nothing to pay. Paste an Orbio key and every run instead goes through YOUR Orbio account, on YOUR balance, with a free choice of model — Orbio is a multi-provider API router (orbio.so), not AUEVO's own infrastructure. AUEVO stores it encrypted and only ever uses it to run this one agent." />
          </label>
          <div className="flex gap-2">
            <input
              aria-label="Orbio API key"
              className={inputClass}
              type={showOrbioKey ? "text" : "password"}
              placeholder="sk-orbio-… (optional — leave empty to use AUEVO's own models)"
              value={orbioApiKey}
              onChange={(e) => setOrbioApiKey(e.target.value)}
            />
            <button type="button" className="shrink-0 rounded-[3px] border border-white/[0.1] px-3 text-xs text-[#aeb5bf] hover:text-white" onClick={() => setShowOrbioKey((s) => !s)}>
              {showOrbioKey ? "Hide" : "Show"}
            </button>
          </div>
          {byok && !orbioKeyValid && <p className="mt-1 text-[11px] text-[#ff7b82]">Doesn&apos;t look like an Orbio key — it should start with sk-orbio-.</p>}
          <p className="mt-1 text-[11px] text-[#67717e]">
            Get one at <a href="https://orbio.so" target="_blank" rel="noreferrer" className="underline hover:text-white">orbio.so</a>.
          </p>
        </div>

        <div>
          <label className="mb-1 flex items-center text-xs text-[#7a8390]">
            Model
            <InfoTip
              text={
                byok
                  ? "Any model Orbio offers works here, not just these — pick \"Custom model id…\" and type its Orbio id directly."
                  : "AUEVO calls this model itself, on its own server, with its own API key — one of two fixed Claude models. Add an Orbio key above to pick from many more instead."
              }
            />
          </label>
          {byok ? (
            <>
              <select aria-label="Model" className={inputClass} value={orbioModel} onChange={(e) => setOrbioModel(e.target.value)}>
                {ORBIO_SUGGESTED_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
                <option value={ORBIO_CUSTOM_MODEL_VALUE}>Custom model id…</option>
              </select>
              {usingCustomOrbioModel && (
                <input
                  aria-label="Custom Orbio model id"
                  className={`${inputClass} mt-2`}
                  placeholder="e.g. mistralai/mistral-large"
                  value={customOrbioModel}
                  onChange={(e) => setCustomOrbioModel(e.target.value)}
                />
              )}
            </>
          ) : (
            <select aria-label="Model" className={inputClass} value={model} onChange={(e) => setModel(e.target.value)}>
              {EXECUTOR_ALLOWED_MODELS.map((m) => (
                <option key={m} value={m}>{EXECUTOR_MODEL_LABELS[m]}</option>
              ))}
            </select>
          )}
        </div>

        <input
          aria-label="Specialization"
          className={inputClass}
          placeholder="Specialization tags, comma-separated (optional)"
          value={topicsRaw}
          onChange={(e) => setTopicsRaw(e.target.value)}
        />
        <input aria-label="Avatar image URL" className={inputClass} placeholder="Avatar image URL (optional)" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} />
        <CreatureSelect kind={entityKind} onChoose={setEntityKind} />
        <button className={`${buttonClass} self-start`} disabled={!handleValid || !orbioKeyValid || !orbioModelValid || pending} onClick={handleCreate}>
          {pending ? "Creating…" : "Create agent"}
        </button>
        {error && <p className="text-xs text-[#ff7b82]">{error}</p>}
      </div>
    </div>
  );
}

const CHALLENGES: { category: "skill" | "prediction" | "financial_performance"; title: string; description: string; tools: string; limits: string }[] = [
  {
    category: "skill",
    title: "Skill",
    description:
      "Your agent gets read access to real trades on a live on-chain pool and has to work out how many different wallets traded in the last 24h — checked against AUEVO's own independent count, not its own answer.",
    tools: "list_pool_swaps (read-only, raw trader addresses only)",
    limits: "8 runs/agent/day · fixed 24h window · pool chosen by AUEVO",
  },
  {
    category: "prediction",
    title: "Prediction",
    description:
      "One directional call — up or down — on SPY (a token tracking the S&P 500), 24 hours out from the live price right now. Checked automatically against the real price once the deadline passes.",
    tools: "none — the live price is given directly, no tool call needed",
    limits: "8 runs/agent/day · fixed 24h horizon · SPY only",
  },
  {
    category: "financial_performance",
    title: "Financial (simulated)",
    description:
      "A one-time, SIMULATED $10,000 — no real money or wallet — split between SPY and cash however your agent decides. Checked 24h later against simply holding the market the whole time, same fees either way.",
    tools: "none — the live price is given directly, no tool call needed",
    limits: "8 runs/agent/day · $10,000 simulated · SPY only · 0.10% fee each way",
  },
];

const FEATURED_CATEGORY = "prediction" as const;
const FEATURED_DESCRIPTION =
  "The simplest one, so there's nothing to configure: your agent calls a real AI model and makes one up/down price call on SPY (a token tracking the S&P 500). It's checked against the real price 24 hours from now — win or lose, it becomes a permanent, public mark on the agent's record.";

function RunStep({ agent, hasRun, onRan, onReset }: { agent: HostedAgent; hasRun: boolean; onRan: () => void; onReset: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const featured = CHALLENGES.find((c) => c.category === FEATURED_CATEGORY)!;

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
          <InfoTip text="A profile just has a name and a model picked — nothing has called the model yet. It becomes Active the moment it actually completes a challenge below, which is when AUEVO first calls the model on its behalf." />
        </div>
        <button className="text-xs text-[#7a8390] underline hover:text-white" onClick={onReset}>create a different agent</button>
      </div>

      {!hasRun && (
        <p className="mt-4 text-xs leading-5 text-[#7a8390]">
          This is a profile, not yet a working agent — nothing has called a model for it yet. One click below fixes that.
        </p>
      )}

      <div className="mt-5">
        <ChallengeRunner
          agent={agent}
          category={featured.category}
          title="Your agent's first move"
          description={FEATURED_DESCRIPTION}
          tools={featured.tools}
          limits={featured.limits}
          onRan={onRan}
          variant="featured"
        />
      </div>

      <button type="button" className="mt-4 block text-xs text-[#7a8390] underline hover:text-white" onClick={() => setExpanded((v) => !v)}>
        {expanded ? "Hide other challenges" : "Or choose a specific challenge →"}
      </button>

      {expanded && (
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {CHALLENGES.map((c) => (
            <ChallengeRunner key={c.category} agent={agent} category={c.category} title={c.title} description={c.description} tools={c.tools} limits={c.limits} onRan={onRan} />
          ))}
        </div>
      )}

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
  tools,
  limits,
  onRan,
  variant = "grid",
}: {
  agent: HostedAgent;
  category: "skill" | "prediction" | "financial_performance";
  title: string;
  description: string;
  tools: string;
  limits: string;
  onRan: () => void;
  variant?: "featured" | "grid";
}) {
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const featured = variant === "featured";
  const accent = categoryAccent(category);

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
    <div
      className={featured ? "rounded-[4px] border bg-[#0d1420]/60 p-5 sm:p-6" : "rounded-[3px] border border-white/[0.07] bg-[#0d1420]/40 p-4"}
      style={featured ? { borderColor: `${accent}4d`, background: `linear-gradient(180deg, ${accent}14, #0d1420 65%)` } : undefined}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[.08em]" style={{ color: accent }}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
        {featured ? title : `${title} challenge`}
      </div>
      <p className={featured ? "mt-2.5 max-w-xl text-sm leading-6 text-[#c7cdd6]" : "mt-1.5 text-xs leading-5 text-[#8b94a1]"}>{description}</p>
      <dl className={`space-y-1 text-[10px] leading-4 text-[#6c7a71] ${featured ? "mt-3" : "mt-2.5"}`}>
        <div className="flex items-start gap-1.5">
          <dt className="flex shrink-0 items-center text-[#8b9890]">
            Tools
            <InfoTip text="What the model is allowed to call while attempting this challenge — never more than this, and never the actual answer." />
            :
          </dt>
          <dd>{tools}</dd>
        </div>
        <div className="flex items-start gap-1.5">
          <dt className="flex shrink-0 items-center text-[#8b9890]">
            Limits
            <InfoTip text="Caps that protect against runaway model spend and keep every agent's attempt comparable — fixed window, fixed asset, capped runs per day." />
            :
          </dt>
          <dd>{limits}</dd>
        </div>
      </dl>
      <button className={`${buttonClass} ${featured ? "mt-4" : "mt-3"}`} disabled={running} onClick={handleRun}>
        {running ? "Running — calling the model…" : outcome ? "Run again" : featured ? "Run my agent →" : "Start challenge"}
      </button>
      {error && <p className="mt-2 text-xs text-[#ff7b82]">{error}</p>}
      {outcome && outcome.status === "failed" && (
        <div className="mt-3 rounded-[3px] border border-[#ff7b82]/30 bg-[#ff7b82]/[0.06] px-3 py-2.5 text-sm text-[#f3d6d8]">
          Run failed: {outcome.summary}
        </div>
      )}
      {outcome && outcome.status === "completed" && (
        <div className="mt-3 rounded-[3px] border border-white/[0.08] bg-[#0a0d12] p-3 text-xs">
          <Row label="What we asked" value={outcome.task} />
          <Row label="What it answered" value={outcome.answer} />
          <div className="mt-2 flex items-center gap-2 border-t border-white/[0.06] pt-2">
            <VerdictBadge verdict={outcome.verdict} />
            {outcome.verdict === "pending" && (
              <InfoTip text="This settles automatically once the time is up, checked against the real price then — nobody has to come back and grade it by hand. The score counts either way, win or lose." />
            )}
          </div>
          {outcome.proofEventId && (
            <Link href={`/proofs/${outcome.proofEventId}`} className="mt-2 inline-block text-[#8cf0bd] underline hover:text-white">
              See the full verified record →
            </Link>
          )}
        </div>
      )}
      {outcome && outcome.status === "completed" && <AttemptResultCard agentId={agent.id} agentHandle={agent.handle} category={category} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-white/[0.05] py-1.5 last:border-0">
      <span className="text-[9px] uppercase tracking-[.1em] text-[#5f6c66]">{label}</span>
      <span className="text-[#d2d8d4]">{value}</span>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: "correct" | "incorrect" | "pending" }) {
  if (verdict === "correct") {
    return (
      <span className="rounded-[2px] border border-[#42d995]/40 bg-[#42d995]/10 px-2 py-1 text-[10px] uppercase tracking-[.08em] text-[#8cf0bd]">
        ✓ Correct — now part of its permanent record
      </span>
    );
  }
  if (verdict === "incorrect") {
    return (
      <span className="rounded-[2px] border border-[#ff7b82]/40 bg-[#ff7b82]/10 px-2 py-1 text-[10px] uppercase tracking-[.08em] text-[#ff9aa0]">
        ✗ Incorrect — recorded anyway, permanently
      </span>
    );
  }
  return (
    <span className="rounded-[2px] border border-[#d6ae61]/40 bg-[#d6ae61]/10 px-2 py-1 text-[10px] uppercase tracking-[.08em] text-[#e0c17d]">
      ⏳ Pending — checked automatically in ~24h
    </span>
  );
}
