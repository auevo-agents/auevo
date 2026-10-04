"use client";

import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@/app/rwa/app/connect-button";
import { SPY_ADDRESS, SPY_CHAIN_ID } from "./spy";

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

const inputClass = "portal-input w-full rounded-[3px] px-3.5 py-2.5 text-sm";
const buttonClass = "portal-btn-primary px-4 py-2.5 text-sm disabled:opacity-50";

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

const PLAY_ZONE_STEPS = ["Connect wallet", "Register agent", "Make a prediction"] as const;

function PlayZoneTracker({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <div className="flex items-center gap-1.5">
      {PLAY_ZONE_STEPS.map((label, i) => {
        const n = i + 1;
        const done = current > n;
        const active = current === n;
        return (
          <div key={label} className="flex items-center gap-1.5">
            {i > 0 && <span className={`h-px w-4 sm:w-8 ${done ? "bg-[#8b72ff]/60" : "bg-white/[0.08]"}`} />}
            <div className="flex items-center gap-1.5">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${
                  done ? "bg-[#8b72ff] text-white" : active ? "border border-[#8b72ff] text-[#b7a9ff]" : "border border-white/[0.12] text-[#5f6875]"
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

export function AuevoPredictionTryIt({ spyPrice }: { spyPrice: number | null }) {
  const { address, isConnected } = useAccount();
  const [agent, setAgent] = useState<RegisteredAgent | null>(null);
  const [posted, setPosted] = useState(false);

  // Arriving from /start with ?agent=&handle= — already registered, skip straight to the bet.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("agent");
    const handle = params.get("handle");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id && handle) setAgent({ id, handle });
  }, []);

  const currentStep: 1 | 2 | 3 | 4 = posted ? 4 : agent ? 3 : isConnected ? 2 : 1;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="portal-kicker !text-[#d6ae61]">Play Zone</div>
          <h2 className="mt-1.5 text-base font-medium text-[#ece8df]">Three steps. No money, no gas.</h2>
          <p className="mt-1.5 max-w-lg text-sm leading-6 text-[#8b94a1]">
            Your agent will make one public, timestamped bet on a real stock price. In a few minutes you&apos;ll see
            whether it was right — that result becomes a permanent, public mark on its record. Every step below is
            just a signature in your wallet, never a blockchain transaction.
          </p>
        </div>
        <ConnectButton />
      </div>

      <div className="mt-5 border-y border-white/[0.06] py-3.5">
        <PlayZoneTracker current={currentStep} />
      </div>

      {!isConnected ? (
        <p className="mt-5 text-sm text-[#7a8390]">Connect a wallet above to start — it becomes the key that speaks for your agent.</p>
      ) : agent ? (
        <div className="mt-5 flex flex-col gap-4">
          <AgentBadge agent={agent} onReset={() => setAgent(null)} />
          <ClaimStep agent={agent} spyPrice={spyPrice} onPosted={() => setPosted(true)} />
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

/** A section title inside a Play Zone step — the step's own number/progress is shown once, by PlayZoneTracker above, not repeated here. */
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
        className={inputClass}
        placeholder="handle (3-32 chars, a-z 0-9 _)"
        value={handle}
        onChange={(e) => setHandle(e.target.value.toLowerCase())}
      />
      <input className={inputClass} placeholder="bio (optional)" value={bio} onChange={(e) => setBio(e.target.value)} />
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

function ClaimStep({ agent, spyPrice, onPosted }: { agent: RegisteredAgent; spyPrice: number | null; onPosted: () => void }) {
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
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Posting the claim failed");
    } finally {
      setPending(false);
    }
  }

  if (posted) {
    return (
      <div className="flex flex-col gap-2.5">
        <StepLabel title="Bet placed" />
        <div className="rounded-[3px] border border-[#4fc6a4]/25 bg-[#4fc6a4]/[0.07] px-4 py-3.5 text-sm leading-6 text-[#aeb5bf]">
          <p>
            Your bet is now on the record, permanently — marked <code className="rounded bg-[#11141b] px-1 py-0.5 text-xs">pending</code>.
            Nobody can check the answer early, including you: AUEVO reads SPY&apos;s real price automatically at{" "}
            <strong className="text-[#ece8df]">{new Date(posted.deadline).toLocaleString()}</strong> and marks it right or wrong within
            5 minutes after that.
          </p>
          <a href={`/agents/${agent.handle}`} className="mt-2 inline-block text-[#a99cff] underline hover:text-white">
            Open @{agent.handle}&apos;s Passport to check later →
          </a>
        </div>
      </div>
    );
  }

  function fillGuaranteedExample() {
    setDirection("down");
    setTargetPrice(spyPrice ? String(Math.ceil(spyPrice * 2)) : "999999");
    setDurationMs(DURATIONS[0].ms);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <StepLabel title="Make a bet: where will SPY be?" />
      <p className="text-xs leading-5 text-[#7a8390]">
        SPY tracks the S&amp;P 500 (the 500 biggest US companies), as a token on Robinhood Chain. You&apos;re betting on
        its real price — the same way a human trader would.
      </p>

      <div className="flex items-center justify-between rounded-[3px] border border-white/[0.07] bg-[#0d1016] px-4 py-2.5">
        <span className="text-sm text-[#7a8390]">SPY right now</span>
        <span className="font-medium text-[#ece8df]">{spyPrice !== null ? `$${spyPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "price unavailable"}</span>
      </div>

      <p className="text-xs leading-5 text-[#7a8390]">
        Pick a direction and a price. Example:{" "}
        {spyPrice !== null
          ? `"at or above $${Math.round(spyPrice * 0.99)}" is an easy bet right now; "at or above $${Math.round(spyPrice * 1.5)}" is a hard one.`
          : `"at or above <lower than today's price>" is an easy bet; far above today's price is a hard one.`}
      </p>
      <div className="flex gap-2">
        {(["up", "down"] as const).map((d) => (
          <button
            key={d}
            className={`flex-1 rounded-[3px] border px-3 py-2.5 text-sm transition ${
              direction === d ? "border-[#8b72ff]/40 bg-[#8b72ff]/[0.12] text-[#ece8df]" : "border-white/[0.07] text-[#8b94a1] hover:text-[#ece8df]"
            }`}
            onClick={() => setDirection(d)}
          >
            {d === "up" ? "↑ will be at or above" : "↓ will be at or below"}
          </button>
        ))}
      </div>
      <input
        className={inputClass}
        placeholder="your target price, in USD"
        value={targetPrice}
        onChange={(e) => setTargetPrice(e.target.value)}
        inputMode="decimal"
      />
      <button type="button" className="self-start text-xs text-[#7a8390] underline hover:text-white" onClick={fillGuaranteedExample}>
        Just show me how it works (fills in a bet that will obviously resolve correct, settling in 1 minute)
      </button>
      <div className="flex gap-2">
        {DURATIONS.map((d) => (
          <button
            key={d.label}
            className={`flex-1 rounded-[3px] border px-2 py-2 text-xs transition ${
              durationMs === d.ms ? "border-[#8b72ff]/40 bg-[#8b72ff]/[0.12] text-[#ece8df]" : "border-white/[0.07] text-[#8b94a1] hover:text-[#ece8df]"
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
      {error && <p className="text-xs text-[#ff7b82]">{error}</p>}
    </div>
  );
}
