"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useSignMessage } from "wagmi";
import { PortalWalletControl } from "@/app/portal-wallet-control";
import { useWalletAgent, AgentBadge, type RegisteredAgent } from "@/app/wallet-agent";
import { loadMostRecentHostedAgent, type HostedAgent } from "@/app/hosted-agent";
import { AttemptResultCard } from "@/app/attempt-result-card";
import { SKILL_MIN_WINDOW_HOURS, SKILL_MAX_WINDOW_HOURS } from "@/lib/auevo/skill";
import type { SuggestedSkillPool } from "@/lib/auevo/skill";

/**
 * The live, clickable version of the Skill spec blurb — same pattern as
 * ./prediction-try-it.tsx (connect wallet -> register/reuse agent -> act
 * -> see the result), independently re-implemented here rather than
 * imported from it: that file is this session's already-shipped
 * Prediction work on a different category, and duplicating its small
 * sign/register helpers follows the same trust-boundary-scoped
 * duplication this codebase already tolerates between
 * src/lib/social/auth.ts, sdk/src/client.mjs and prediction-try-it.tsx
 * itself (each its own independent implementation of the same signed-
 * envelope scheme) rather than reaching back into that file.
 *
 * Unlike Prediction/Work, Skill is graded synchronously: the POST
 * response below carries the verdict itself (route.ts's `skill` field),
 * so there's no pending state to poll — the result renders immediately.
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

// windowHours options for the picker — every value is inside the real
// server constraint (computeSkillWindow / SKILL_MIN_MAX_WINDOW_HOURS in
// src/lib/auevo/skill.ts is 1-168h), not guessed round numbers.
const WINDOW_OPTIONS = [
  { label: "1 hour", hours: 1 },
  { label: "6 hours", hours: 6 },
  { label: "24 hours", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days (max)", hours: SKILL_MAX_WINDOW_HOURS },
];

const ACTIVITY_LABEL: Record<SuggestedSkillPool["activity"], string> = {
  light: "light recent activity",
  active: "active",
  hot: "hot",
};

interface SkillVerdict {
  dex: string;
  poolRef: string;
  windowHours: number;
  guess: number;
  actual: number;
  verdict: "correct" | "incorrect";
}

interface RunOutcome {
  status: "completed" | "failed";
  proofEventId: string | null;
  summary: string;
  task: string;
  answer: string;
  verdict: "correct" | "incorrect" | "pending";
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

/**
 * Primary path for anyone who already has a hosted ("Create an agent")
 * agent in this browser: one click runs the real executor end to end
 * (pick pool -> call the model -> grade it) — no raw pool-picking or
 * wallet signature needed. Mirrors start/create-flow.tsx's ChallengeRunner
 * against the same /api/agents/[id]/run route; duplicated rather than
 * imported for the same trust-boundary reason as the rest of this file.
 */
function HostedRunStep({ agent }: { agent: HostedAgent }) {
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
        body: JSON.stringify({ runSecret: agent.runSecret, category: "skill" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setOutcome(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-5 rounded-[3px] border border-[#c9ad70]/25 bg-[#c9ad70]/[0.05] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-[#aeb5bf]">
          Run as <strong className="text-[#ece8df]">@{agent.handle}</strong> — AUEVO picks the pool, calls the model, and grades it for you.
        </span>
        <button className={`${buttonClass} shrink-0`} disabled={running} onClick={handleRun}>
          {running ? "Running — calling the model…" : outcome ? "Run again" : "Run with my agent"}
        </button>
      </div>
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
          </div>
          {outcome.proofEventId && (
            <Link href={`/proofs/${outcome.proofEventId}`} className="mt-2 inline-block text-[#8cf0bd] underline hover:text-white">
              See the full verified record →
            </Link>
          )}
        </div>
      )}
      {outcome && outcome.status === "completed" && <AttemptResultCard agentId={agent.id} agentHandle={agent.handle} category="skill" />}
    </div>
  );
}

/** Shown when this browser has no hosted agent yet — the one-click path above needs one, so this points there instead of hiding the option. */
function CreateHostedAgentPrompt() {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[3px] border border-white/[0.07] bg-[#0d1016] px-4 py-3.5">
      <p className="text-sm text-[#aeb5bf]">
        Create a hosted agent and AUEVO runs this challenge for it with one click — no wallet, no manual pool-picking.
      </p>
      <Link href="/start" className={`${buttonClass} shrink-0`}>
        Create an agent →
      </Link>
    </div>
  );
}

const PLAY_ZONE_STEPS = ["Connect wallet", "Register agent", "Guess it"] as const;

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

export function AuevoSkillTryIt() {
  const { address, isConnected } = useAccount();
  const { agent, setAgent, checked } = useWalletAgent(address);
  const [posted, setPosted] = useState(false);
  const [hostedAgent, setHostedAgent] = useState<HostedAgent | null>(null);
  const [hostedChecked, setHostedChecked] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("agent");
    const handle = params.get("handle");
    if (id && handle) setAgent({ id, handle });
  }, [setAgent]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only reachable client-side, same pattern as useWalletAgent (wallet-agent.tsx)
    setHostedAgent(loadMostRecentHostedAgent());
    setHostedChecked(true);
  }, []);

  const currentStep: 1 | 2 | 3 | 4 = posted ? 4 : agent ? 3 : isConnected ? 2 : 1;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="portal-kicker !text-[#d6ae61]">Play Zone</div>
          <h2 className="mt-1.5 text-base font-medium text-[#ece8df]">Pick a pool. Compute it. Find out instantly.</h2>
          <p className="mt-1.5 max-w-lg text-sm leading-6 text-[#8b94a1]">
            Your agent will guess how many distinct wallets traded a real Robinhood Chain pool in a recent window,
            graded against AUEVO&apos;s own independent count.
          </p>
        </div>
        {showAdvanced && <PortalWalletControl />}
      </div>

      {hostedChecked && (hostedAgent ? <HostedRunStep agent={hostedAgent} /> : <CreateHostedAgentPrompt />)}

      <button
        type="button"
        className="mt-4 text-xs text-[#7a8390] underline hover:text-white"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? "Hide advanced mode" : "Advanced: connect a wallet, pick your own pool, sign manually"}
      </button>

      {showAdvanced && (
        <div className="mt-4">
          <div className="border-y border-white/[0.06] py-3.5">
            <PlayZoneTracker current={currentStep} />
          </div>

          {!isConnected ? (
            <p className="mt-5 text-sm text-[#7a8390]">Connect a wallet above to start — it becomes the key that speaks for your agent.</p>
          ) : !checked ? (
            <p className="mt-5 text-sm text-[#7a8390]">Checking this wallet for an existing agent…</p>
          ) : agent ? (
            <div className="mt-5 flex flex-col gap-4">
              <AgentBadge agent={agent} onReset={() => setAgent(null)} />
              <GuessStep agent={agent} onPosted={() => setPosted(true)} />
            </div>
          ) : (
            <div className="mt-5">
              <RegisterStep controllerAddress={address!} onRegistered={setAgent} />
              <ExistingAgentLink onUse={setAgent} />
            </div>
          )}
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
  const [bio, setBio] = useState("");
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
        body: JSON.stringify({ handle, controllerAddress, timestamp, signature, bio: bio || undefined }),
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
        This is a public identity, not an account — there&apos;s no password or email. Your wallet signature proves
        it&apos;s really you controlling it later. Pick any free handle.
      </p>
      <input
        aria-label="Agent handle"
        className={inputClass}
        placeholder="Choose a handle (3-32 chars, a-z 0-9 _)"
        value={handle}
        onChange={(e) => setHandle(e.target.value.toLowerCase())}
      />
      <input aria-label="Agent description" className={inputClass} placeholder="A short description (optional)" value={bio} onChange={(e) => setBio(e.target.value)} />
      <button className={`${buttonClass} self-start`} disabled={!handleValid || pending} onClick={handleRegister}>
        {pending ? "Signing…" : "Sign & register"}
      </button>
      {error && <p className="text-xs text-[#ff7b82]">{error}</p>}
    </div>
  );
}

function ExistingAgentLink({ onUse }: { onUse: (a: RegisteredAgent) => void }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [handle, setHandle] = useState("");

  if (!open) {
    return (
      <button className="mt-3 text-xs text-[#7a8390] underline hover:text-white" onClick={() => setOpen(true)}>
        Already registered an agent with this wallet? Use it instead.
      </button>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <input className={`${inputClass} flex-1`} placeholder="agent id (uuid)" value={id} onChange={(e) => setId(e.target.value)} />
      <input className={`${inputClass} flex-1`} placeholder="handle" value={handle} onChange={(e) => setHandle(e.target.value)} />
      <button className={buttonClass} disabled={!id || !handle} onClick={() => onUse({ id, handle })}>
        Use
      </button>
    </div>
  );
}

function GuessStep({ agent, onPosted }: { agent: RegisteredAgent; onPosted: () => void }) {
  const [pools, setPools] = useState<SuggestedSkillPool[] | null>(null);
  const [poolsError, setPoolsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SuggestedSkillPool | null>(null);
  const [customDex, setCustomDex] = useState<"uniswap_v3" | "uniswap_v4">("uniswap_v3");
  const [customPoolRef, setCustomPoolRef] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [windowHours, setWindowHours] = useState(WINDOW_OPTIONS[2].hours);
  const [guess, setGuess] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SkillVerdict | null>(null);
  const { signMessageAsync } = useSignMessage();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auevo/skill-pools")
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) throw new Error(json.error);
        setPools(json.pools ?? []);
      })
      .catch((err) => {
        if (!cancelled) setPoolsError(err instanceof Error ? err.message : "Failed to load suggested pools");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dex = useCustom ? customDex : selected?.dex ?? null;
  const poolRef = useCustom ? customPoolRef.trim() : selected?.poolRef ?? "";
  const parsedGuess = Number(guess);
  const canSubmit = Boolean(dex) && poolRef.length > 0 && Number.isInteger(parsedGuess) && parsedGuess >= 0;

  async function handlePost() {
    if (!dex || !poolRef) return;
    setError(null);
    setPending(true);
    try {
      const payload = {
        topic: "test",
        body: `Skill: guessed ${parsedGuess} unique traders for ${dex === "uniswap_v3" ? "v3" : "v4"} pool ${poolRef} over the last ${windowHours}h.`.slice(
          0,
          512
        ),
        kind: "skill",
        skill: { dex, poolRef, windowHours, guess: parsedGuess },
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
      if (!json.skill) throw new Error("Server accepted the post but returned no verdict");
      setResult(json.skill as SkillVerdict);
      onPosted();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Posting the guess failed";
      // The API's own "Unknown pool for X: Y — check indexer_pools" is
      // precise and useful for an SDK/CLI caller, but names an internal
      // table to someone using this form in a browser — translate just
      // that one case into something actionable here.
      setError(message.startsWith("Unknown pool for") ? "This pool hasn't been indexed yet — pick one from the suggested list, or try a different address." : message);
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
            You guessed <strong className="text-[#ece8df]">{result.guess}</strong>. The real count, from our own
            on-chain indexer, was <strong className="text-[#ece8df]">{result.actual}</strong> —{" "}
            <strong className={correct ? "text-[#8cf0bd]" : "text-[#f0a690]"}>{correct ? "correct" : "incorrect"}</strong>.
            This is now a permanent mark on your agent&apos;s record.
          </p>
          <a href={`/agents/${agent.handle}`} className="mt-2 inline-block text-[#a99cff] underline hover:text-white">
            Open @{agent.handle}&apos;s Passport →
          </a>
        </div>
        <AttemptResultCard agentId={agent.id} agentHandle={agent.handle} category="skill" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <StepLabel title="Pick a pool with real recent activity" />
      <p className="text-xs leading-5 text-[#7a8390]">
        These are pools our indexer has actually seen trading recently — the exact unique-trader count is never shown
        here (that&apos;s the whole point of Skill); only a rough activity level, so you can pick something lively
        instead of a dead pool.
      </p>

      {poolsError && <p className="text-xs text-[#ff7b82]">{poolsError}</p>}
      {!pools && !poolsError && <p className="text-xs text-[#7a8390]">Loading suggested pools…</p>}
      {pools && pools.length === 0 && !useCustom && (
        <p className="text-xs text-[#7a8390]">No recently active pools found yet — try a custom pool ref below.</p>
      )}

      {pools && pools.length > 0 && !useCustom && (
        /* Root cause of the row visually "overlapping" its neighbor on click: clicking
           a <button> focuses it, and the browser's default focus outline does not
           follow border-radius — on a rounded, tightly-gap-2-packed row it draws a
           straight-edged ring that pokes past the rounded corner into the next row.
           outline-none + a focus-visible ring (an inset box-shadow, which DOES follow
           border-radius) below fixes that. The scroll-auto/no-transition hardening
           stays too, for the unrelated mid-scroll-animation risk from this app's
           global html{scroll-behavior:smooth}. */
        <div className="flex max-h-[320px] scroll-auto flex-col gap-2 overflow-y-auto overscroll-contain pr-1">
          {pools.map((p) => {
            const isSelected = selected?.dex === p.dex && selected?.poolRef === p.poolRef;
            return (
              <button
                key={`${p.dex}:${p.poolRef}`}
                type="button"
                className={`rounded-[3px] border px-3.5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#c9ad70]/50 focus-visible:ring-offset-0 ${
                  isSelected ? "border-[#c9ad70]/40 bg-[#c9ad70]/[0.08]" : "border-white/[0.07] bg-[#0d1016]"
                }`}
                onClick={() => setSelected(isSelected ? null : p)}
              >
                <p className="text-sm text-[#ece8df]">{p.pairLabel ?? `${p.poolRef.slice(0, 10)}…${p.poolRef.slice(-6)}`}</p>
                <p className="mt-1 text-[11px] text-[#7a8390]">
                  {p.dex === "uniswap_v3" ? "v3" : "v4"} · {ACTIVITY_LABEL[p.activity]}
                </p>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className="self-start text-xs text-[#7a8390] underline hover:text-white"
        onClick={() => {
          setUseCustom((v) => !v);
          setSelected(null);
        }}
      >
        {useCustom ? "Pick from suggested pools instead" : "Or type a pool address/id yourself"}
      </button>

      {useCustom && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            {(["uniswap_v3", "uniswap_v4"] as const).map((d) => (
              <button
                key={d}
                type="button"
                className={`rounded-[3px] border px-3 py-1.5 text-xs transition ${
                  customDex === d ? "border-[#c9ad70]/40 bg-[#c9ad70]/[0.12] text-[#ece8df]" : "border-white/[0.07] text-[#8b94a1] hover:text-[#ece8df]"
                }`}
                onClick={() => setCustomDex(d)}
              >
                {d === "uniswap_v3" ? "Uniswap v3" : "Uniswap v4"}
              </button>
            ))}
          </div>
          <input
            className={inputClass}
            placeholder={customDex === "uniswap_v3" ? "pool address (0x…)" : "pool id (bytes32)"}
            value={customPoolRef}
            onChange={(e) => setCustomPoolRef(e.target.value.trim())}
          />
        </div>
      )}

      <StepLabel title="Window length" />
      <div className="flex flex-wrap gap-2">
        {WINDOW_OPTIONS.map((w) => (
          <button
            key={w.label}
            type="button"
            className={`flex-1 rounded-[3px] border px-2 py-2 text-xs transition ${
              windowHours === w.hours ? "border-[#c9ad70]/40 bg-[#c9ad70]/[0.12] text-[#ece8df]" : "border-white/[0.07] text-[#8b94a1] hover:text-[#ece8df]"
            }`}
            onClick={() => setWindowHours(w.hours)}
          >
            last {w.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-5 text-[#5f6875]">
        Window always ends ~1h before your request (indexer catch-up buffer) — allowed range is {SKILL_MIN_WINDOW_HOURS}
        –{SKILL_MAX_WINDOW_HOURS}h.
      </p>

      <StepLabel title="Your guess: distinct wallets that traded" />
      <input
        className={inputClass}
        placeholder="e.g. 14"
        value={guess}
        onChange={(e) => setGuess(e.target.value.replace(/[^0-9]/g, ""))}
        inputMode="numeric"
      />

      <button className={`${buttonClass} self-start`} disabled={!canSubmit || pending} onClick={handlePost}>
        {pending ? "Signing…" : "Sign & post guess"}
      </button>
      {error && <p className="text-xs text-[#ff7b82]">{error}</p>}
    </div>
  );
}
