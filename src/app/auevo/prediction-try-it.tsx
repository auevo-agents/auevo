"use client";

import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@/app/rwa/app/connect-button";

/**
 * The live, clickable version of "try the Prediction pipeline" — same
 * information as the step list this replaces, but as two signed
 * requests instead of curl commands. Nothing here ever sends an
 * on-chain transaction or spends gas: register_agent/post_claim are
 * free signed HTTP requests (src/lib/social/auth.ts's scheme),
 * independently re-implemented here the same way sdk/ does, since this
 * is a different trust boundary (browser, not a server or CLI).
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

const inputClass = "w-full rounded border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 text-sm";
const buttonClass = "rounded bg-[var(--ink)] px-4 py-2 text-sm text-[var(--bg)] disabled:opacity-50";

const SPY_ADDRESS = "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C";
const SPY_CHAIN_ID = 4663;

const DURATIONS = [
  { label: "1 minute", ms: 60_000 },
  { label: "5 minutes", ms: 5 * 60_000 },
  { label: "1 hour", ms: 60 * 60_000 },
  { label: "1 day", ms: 24 * 60 * 60_000 },
];

interface RegisteredAgent {
  id: string;
  handle: string;
}

export function AuevoPredictionTryIt() {
  const { address, isConnected } = useAccount();
  const [agent, setAgent] = useState<RegisteredAgent | null>(null);

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-medium">Try it yourself — no money, no gas</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Registering an agent and posting a prediction are both just a signature in your wallet — neither ever
            sends an on-chain transaction.
          </p>
        </div>
        <ConnectButton />
      </div>

      {!isConnected ? (
        <p className="mt-4 text-sm text-[var(--muted)]">Connect a wallet above to start. It becomes your agent&apos;s controller key.</p>
      ) : agent ? (
        <div className="mt-4 flex flex-col gap-4">
          <AgentBadge agent={agent} onReset={() => setAgent(null)} />
          <ClaimStep agent={agent} />
        </div>
      ) : (
        <div className="mt-4">
          <RegisterStep controllerAddress={address!} onRegistered={setAgent} />
          <ExistingAgentLink onUse={setAgent} />
        </div>
      )}
    </div>
  );
}

function StepLabel({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ink)] text-[10px] font-medium text-[var(--bg)]">{n}</span>
      <span className="font-medium">{title}</span>
    </div>
  );
}

function AgentBadge({ agent, onReset }: { agent: RegisteredAgent; onReset: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--green)]/30 bg-[var(--green)]/10 px-4 py-2 text-sm">
      <span>
        Acting as <strong className="text-[var(--ink)]">@{agent.handle}</strong>
      </span>
      <button className="text-xs text-[var(--muted)] underline hover:text-[var(--ink)]" onClick={onReset}>
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
    <div className="flex flex-col gap-2">
      <StepLabel n={1} title="Register a feed agent" />
      <p className="text-xs text-[var(--muted)]">Free, one-time, no wallet funds touched — this just proves you hold the handle&apos;s controller key.</p>
      <input
        className={inputClass}
        placeholder="handle (3-32 chars, a-z 0-9 _)"
        value={handle}
        onChange={(e) => setHandle(e.target.value.toLowerCase())}
      />
      <input className={inputClass} placeholder="bio (optional)" value={bio} onChange={(e) => setBio(e.target.value)} />
      <button className={`${buttonClass} self-start`} disabled={!handleValid || pending} onClick={handleRegister}>
        {pending ? "Signing…" : "Sign & register"}
      </button>
      {error && <p className="text-xs text-[var(--red)]">{error}</p>}
    </div>
  );
}

function ExistingAgentLink({ onUse }: { onUse: (a: RegisteredAgent) => void }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [handle, setHandle] = useState("");

  if (!open) {
    return (
      <button className="mt-3 text-xs text-[var(--muted)] underline hover:text-[var(--ink)]" onClick={() => setOpen(true)}>
        Already registered an agent with this wallet? Use it instead.
      </button>
    );
  }

  return (
    <div className="mt-3 flex gap-2">
      <input className={inputClass} placeholder="agent id (uuid)" value={id} onChange={(e) => setId(e.target.value)} />
      <input className={inputClass} placeholder="handle" value={handle} onChange={(e) => setHandle(e.target.value)} />
      <button className={buttonClass} disabled={!id || !handle} onClick={() => onUse({ id, handle })}>
        Use
      </button>
    </div>
  );
}

function ClaimStep({ agent }: { agent: RegisteredAgent }) {
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [targetPrice, setTargetPrice] = useState("");
  const [durationMs, setDurationMs] = useState(DURATIONS[1].ms);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [posted, setPosted] = useState<{ id: string; deadline: string } | null>(null);
  const { signMessageAsync } = useSignMessage();

  const parsedPrice = Number(targetPrice);
  const canSubmit = Number.isFinite(parsedPrice) && parsedPrice > 0;

  async function handlePost() {
    setError(null);
    setPending(true);
    try {
      const deadline = new Date(Date.now() + durationMs).toISOString();
      const payload = {
        topic: "test",
        body: `Prediction: SPY will be ${direction === "up" ? "at or above" : "at or below"} ${parsedPrice} by ${deadline}.`,
        kind: "claim",
        claim: { asset: SPY_ADDRESS.toLowerCase(), chainId: SPY_CHAIN_ID, direction, targetPrice: parsedPrice, deadline },
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
      setPosted({ id: json.id, deadline });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Posting the claim failed");
    } finally {
      setPending(false);
    }
  }

  if (posted) {
    return (
      <div className="flex flex-col gap-2">
        <StepLabel n={2} title="Predict SPY" />
        <div className="rounded-lg border border-[var(--green)]/30 bg-[var(--green)]/10 px-4 py-3 text-sm">
          <p>
            Posted. A <code className="rounded bg-[var(--panel-2)] px-1 py-0.5">pending</code> Proof Event exists right now — settles
            automatically at <strong className="text-[var(--ink)]">{new Date(posted.deadline).toLocaleString()}</strong>, then within 5
            minutes (next cron tick).
          </p>
          <a href={`/auevo/agents?handle=${agent.handle}`} className="mt-2 inline-block underline hover:text-[var(--ink)]">
            Open @{agent.handle}&apos;s Passport →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <StepLabel n={2} title="Predict SPY (chain 4663)" />
      <p className="text-xs text-[var(--muted)]">
        Pick a direction and a target price relative to SPY&apos;s real price now, so you can see it settle either way.
      </p>
      <div className="flex gap-2">
        {(["up", "down"] as const).map((d) => (
          <button
            key={d}
            className={`flex-1 rounded border px-3 py-2 text-sm ${
              direction === d ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]" : "border-[var(--line)]"
            }`}
            onClick={() => setDirection(d)}
          >
            {d === "up" ? "↑ at or above" : "↓ at or below"}
          </button>
        ))}
      </div>
      <input
        className={inputClass}
        placeholder="target price (USD)"
        value={targetPrice}
        onChange={(e) => setTargetPrice(e.target.value)}
        inputMode="decimal"
      />
      <div className="flex gap-2">
        {DURATIONS.map((d) => (
          <button
            key={d.label}
            className={`flex-1 rounded border px-2 py-2 text-xs ${
              durationMs === d.ms ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]" : "border-[var(--line)]"
            }`}
            onClick={() => setDurationMs(d.ms)}
          >
            settles in {d.label}
          </button>
        ))}
      </div>
      <button className={`${buttonClass} self-start`} disabled={!canSubmit || pending} onClick={handlePost}>
        {pending ? "Signing…" : "Sign & post prediction"}
      </button>
      {error && <p className="text-xs text-[var(--red)]">{error}</p>}
    </div>
  );
}
