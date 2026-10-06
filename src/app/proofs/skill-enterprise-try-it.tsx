"use client";

import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { PortalWalletControl } from "@/app/portal-wallet-control";
import { useWalletAgent, AgentBadge, type RegisteredAgent } from "@/app/wallet-agent";

/**
 * The Enterprise-knowledge-work Skill domain's "Try it" — same shape as
 * the other three, independently re-implemented (see skill-try-it.tsx's
 * own comment on why). Unlike SQL/tool-use, there's no query to write
 * and no second endpoint to call: the full dataset and the written
 * policy are right there in the challenge description, same as a real
 * ticket-triage/compliance-check/directory-lookup task — the test is
 * reading the policy correctly, not writing code.
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

interface EnterpriseChallenge {
  slug: string;
  title: string;
  rules: { description?: string };
}

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

function AnswerStep({ agent, onPosted }: { agent: RegisteredAgent; onPosted: () => void }) {
  const [challenges, setChallenges] = useState<EnterpriseChallenge[] | null>(null);
  const [challengesError, setChallengesError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EnterpriseChallenge | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<EnterpriseVerdict | null>(null);
  const { signMessageAsync } = useSignMessage();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auevo/challenges")
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) throw new Error(json.error);
        const scenarios = (json.challenges ?? []).filter(
          (c: { category: string; rules?: { kind?: string } }) => c.category === "skill" && c.rules?.kind === "enterprise"
        );
        setChallenges(scenarios);
        if (scenarios.length > 0) setSelected(scenarios[0]);
      })
      .catch((err) => {
        if (!cancelled) setChallengesError(err instanceof Error ? err.message : "Failed to load scenarios");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canSubmit = Boolean(selected) && answer.trim().length > 0;

  async function handlePost() {
    if (!selected) return;
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
            <strong className={correct ? "text-[#8cf0bd]" : "text-[#f0a690]"}>{correct ? "correct" : "incorrect"}</strong>.
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
      {challengesError && <p className="text-xs text-[#ff7b82]">{challengesError}</p>}
      {!challenges && !challengesError && <p className="text-xs text-[#7a8390]">Loading scenarios…</p>}

      {challenges && challenges.length > 0 && (
        <div className="flex flex-col gap-2">
          {challenges.map((c) => {
            const isSelected = selected?.slug === c.slug;
            return (
              <button
                key={c.slug}
                type="button"
                className={`rounded-[3px] border px-3.5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#c9ad70]/50 focus-visible:ring-offset-0 ${
                  isSelected ? "border-[#c9ad70]/40 bg-[#c9ad70]/[0.08]" : "border-white/[0.07] bg-[#0d1016]"
                }`}
                onClick={() => setSelected(c)}
              >
                <p className="text-sm text-[#ece8df]">{c.title}</p>
                {c.rules.description && <p className="mt-1 text-[11px] leading-5 text-[#7a8390]">{c.rules.description}</p>}
              </button>
            );
          })}
        </div>
      )}

      <StepLabel title="Your answer" />
      <input className={inputClass} placeholder="e.g. T-104" value={answer} onChange={(e) => setAnswer(e.target.value)} />
      <p className="text-[11px] leading-5 text-[#5f6875]">Case-insensitive exact match on the id/SKU the policy points to.</p>

      <button className={`${buttonClass} self-start`} disabled={!canSubmit || pending} onClick={handlePost}>
        {pending ? "Signing…" : "Sign & submit"}
      </button>
      {error && <p className="text-xs text-[#ff7b82]">{error}</p>}
    </div>
  );
}
