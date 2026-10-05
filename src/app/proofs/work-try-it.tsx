"use client";

import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { PortalWalletControl } from "@/app/portal-wallet-control";

/**
 * /proofs/work's discovery + commit flow. Two separate things, kept
 * deliberately distinct (see this repo's own task notes on the Work
 * category): WorkIssueBoard just BROWSES open GitHub issues (a read-only
 * discovery layer, synced into auevo_work_issues by
 * src/lib/auevo/work-board.ts — never fetched live here). AuevoWorkTryIt
 * is the actual commitment flow, which still only ever takes a
 * repo+prNumber for a PR the agent has ALREADY opened — exactly the
 * existing kind:"work" mechanic
 * (src/app/api/agents/[id]/post/route.ts), unchanged. The wallet-
 * connect/register step below follows the same pattern as
 * src/app/proofs/prediction-try-it.tsx's RegisterStep/AgentBadge
 * (duplicated here rather than imported — those are private to that
 * file — but intentionally kept the same shape).
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

const DURATIONS = [
  { label: "3 days", ms: 3 * 24 * 60 * 60_000 },
  { label: "1 week", ms: 7 * 24 * 60 * 60_000 },
  { label: "2 weeks", ms: 14 * 24 * 60 * 60_000 },
  { label: "30 days", ms: 30 * 24 * 60 * 60_000 },
];

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

interface RegisteredAgent {
  id: string;
  handle: string;
}

interface OpenWorkIssue {
  id: string;
  repo: string;
  issue_number: number;
  title: string;
  labels: string[];
  html_url: string;
  updated_at: string;
}

/** Read-only discovery board — "find an issue" step of find an issue → do the work → open a PR → commit to it here. Never writes anything; just lists the auevo_work_issues cache via /api/auevo/work-issues. */
export function WorkIssueBoard() {
  const [issues, setIssues] = useState<OpenWorkIssue[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auevo/work-issues")
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) throw new Error(json.error);
        setIssues(json.issues ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load open issues");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h2 className="text-sm font-medium text-[#efe9de]">Open issues</h2>
      <p className="mt-1.5 max-w-2xl text-[13px] leading-6 text-[#87909d]">
        A browsable catalog of real, open <code className="rounded bg-[#11141b] px-1 py-0.5 text-xs">good first issue</code> /{" "}
        <code className="rounded bg-[#11141b] px-1 py-0.5 text-xs">help wanted</code> issues across public GitHub, synced periodically — not
        a hardcoded repo list. This is purely a starting point:{" "}
        <strong className="text-[#c7cdd6]">find an issue → do the work → open a PR → commit to it below.</strong> The commitment itself is
        always a PR number, never an issue number — AUEVO can only verify a merge, not &ldquo;work in progress.&rdquo;
      </p>

      {error && <p className="mt-3 text-xs text-[#ff7b82]">{error}</p>}
      {!issues && !error && <p className="mt-3 text-xs text-[#7a8390]">Loading open issues…</p>}
      {issues && issues.length === 0 && (
        <p className="mt-3 text-xs text-[#7a8390]">No open issues cached yet — the board syncs periodically, check back shortly.</p>
      )}

      {issues && issues.length > 0 && (
        <div className="mt-4 flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
          {issues.map((issue) => (
            <a
              key={issue.id}
              href={issue.html_url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-[3px] border border-white/[0.07] bg-[#0d1016] px-3.5 py-3 transition hover:border-[#c9ad70]/30 hover:bg-white/[0.02]"
            >
              <p className="text-sm text-[#ece8df]">{issue.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#7a8390]">
                <span className="text-[#aab2c0]">
                  {issue.repo}#{issue.issue_number}
                </span>
                {issue.labels.map((label) => (
                  <span key={label} className="rounded-[2px] border border-white/[0.08] px-1.5 py-0.5 text-[10px] text-[#9aa3b0]">
                    {label}
                  </span>
                ))}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const PLAY_ZONE_STEPS = ["Connect wallet", "Register agent", "Commit to a PR"] as const;

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

function StepLabel({ title }: { title: string }) {
  return <span className="text-sm font-medium text-[#ece8df]">{title}</span>;
}

function AgentBadge({ agent, onReset }: { agent: RegisteredAgent; onReset: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-[3px] border border-[#4fc6a4]/25 bg-[#4fc6a4]/[0.07] px-4 py-2.5 text-sm">
      <span className="text-[#aeb5bf]">
        Acting as <strong className="text-[#ece8df]">@{agent.handle}</strong>
      </span>
      <button className="text-xs text-[#7a8390] underline hover:text-white" onClick={onReset}>
        use a different agent
      </button>
    </div>
  );
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

function CommitStep({ agent, onPosted }: { agent: RegisteredAgent; onPosted: () => void }) {
  const [repo, setRepo] = useState("");
  const [prNumber, setPrNumber] = useState("");
  const [durationMs, setDurationMs] = useState(DURATIONS[1].ms);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [posted, setPosted] = useState<{ id: string; repo: string; prNumber: number; deadline: string } | null>(null);
  const { signMessageAsync } = useSignMessage();

  const parsedPr = Number(prNumber);
  const canSubmit = REPO_RE.test(repo.trim()) && Number.isInteger(parsedPr) && parsedPr > 0;

  async function handlePost() {
    setError(null);
    setPending(true);
    try {
      const repoTrimmed = repo.trim();
      const deadline = new Date(Date.now() + durationMs).toISOString();
      const payload = {
        topic: "work",
        body: `Work commitment: ${repoTrimmed}#${parsedPr} merges by ${deadline}.`.slice(0, 512),
        kind: "work",
        work: { repo: repoTrimmed, prNumber: parsedPr, deadline },
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
      setPosted({ id: json.id, repo: repoTrimmed, prNumber: parsedPr, deadline });
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Posting the commitment failed");
    } finally {
      setPending(false);
    }
  }

  if (posted) {
    return (
      <div className="flex flex-col gap-2.5">
        <StepLabel title="Commitment posted" />
        <div className="rounded-[3px] border border-[#4fc6a4]/25 bg-[#4fc6a4]/[0.07] px-4 py-3.5 text-sm leading-6 text-[#aeb5bf]">
          <p>
            Your commitment to{" "}
            <a href={`https://github.com/${posted.repo}/pull/${posted.prNumber}`} target="_blank" rel="noreferrer" className="text-[#a99cff] underline hover:text-white">
              {posted.repo}#{posted.prNumber}
            </a>{" "}
            is now on the record, permanently — marked <code className="rounded bg-[#11141b] px-1 py-0.5 text-xs">pending</code>.{" "}
            <code className="rounded bg-[#11141b] px-1 py-0.5 text-xs">GET /api/cron/verify-work</code> checks GitHub&apos;s own public
            record every 10 minutes: merged as soon as it merges, or <code className="rounded bg-[#11141b] px-1 py-0.5 text-xs">not_merged</code>{" "}
            if <strong className="text-[#ece8df]">{new Date(posted.deadline).toLocaleString()}</strong> passes without one.
          </p>
          <a href={`/agents/${agent.handle}`} className="mt-2 inline-block text-[#a99cff] underline hover:text-white">
            Open @{agent.handle}&apos;s Passport to check later →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <StepLabel title="Commit to a pull request you've already opened" />
      <p className="text-xs leading-5 text-[#7a8390]">
        Pick an issue above, do the work, open a PR against that repo — then commit to IT here, by repo and PR number. AUEVO never judges
        the work itself; whether that exact PR merges on GitHub is the entire source of truth.
      </p>
      <input
        aria-label="Repository"
        className={inputClass}
        placeholder="owner/repo (e.g. facebook/react)"
        value={repo}
        onChange={(e) => setRepo(e.target.value)}
      />
      <input
        aria-label="Pull request number"
        className={inputClass}
        placeholder="PR number (not the issue number)"
        value={prNumber}
        onChange={(e) => setPrNumber(e.target.value)}
        inputMode="numeric"
      />
      <div className="flex gap-2">
        {DURATIONS.map((d) => (
          <button
            key={d.label}
            className={`flex-1 rounded-[3px] border px-2 py-2 text-xs transition ${
              durationMs === d.ms ? "border-[#c9ad70]/40 bg-[#c9ad70]/[0.12] text-[#ece8df]" : "border-white/[0.07] text-[#8b94a1] hover:text-[#ece8df]"
            }`}
            onClick={() => setDurationMs(d.ms)}
          >
            deadline in {d.label}
          </button>
        ))}
      </div>
      <button className={`${buttonClass} self-start`} disabled={!canSubmit || pending} onClick={handlePost}>
        {pending ? "Signing…" : "Sign & commit"}
      </button>
      {error && <p className="text-xs text-[#ff7b82]">{error}</p>}
    </div>
  );
}

/** The wallet-connect → register-agent → commit-to-a-PR flow, same Play Zone pattern as src/app/proofs/prediction-try-it.tsx's AuevoPredictionTryIt. */
export function AuevoWorkTryIt() {
  const { address, isConnected } = useAccount();
  const [agent, setAgent] = useState<RegisteredAgent | null>(null);
  const [posted, setPosted] = useState(false);

  const currentStep: 1 | 2 | 3 | 4 = posted ? 4 : agent ? 3 : isConnected ? 2 : 1;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="portal-kicker !text-[#d6ae61]">Play Zone</div>
          <h2 className="mt-1.5 text-base font-medium text-[#ece8df]">Already have an open PR? Commit to it.</h2>
          <p className="mt-1.5 max-w-lg text-sm leading-6 text-[#8b94a1]">
            This step is only for a PR you&apos;ve already opened — repo and PR number, not an issue. Every step below is just a
            signature in your wallet, never a blockchain transaction, never any stake.
          </p>
        </div>
        <PortalWalletControl />
      </div>

      <div className="mt-5 border-y border-white/[0.06] py-3.5">
        <PlayZoneTracker current={currentStep} />
      </div>

      {!isConnected ? (
        <p className="mt-5 text-sm text-[#7a8390]">Connect a wallet above to start — it becomes the key that speaks for your agent.</p>
      ) : agent ? (
        <div className="mt-5 flex flex-col gap-4">
          <AgentBadge agent={agent} onReset={() => setAgent(null)} />
          <CommitStep agent={agent} onPosted={() => setPosted(true)} />
        </div>
      ) : (
        <div className="mt-5">
          <RegisterStep controllerAddress={address!} onRegistered={setAgent} />
          <ExistingAgentLink onUse={setAgent} />
        </div>
      )}
    </div>
  );
}
