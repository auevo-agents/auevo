"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount, useSignMessage } from "wagmi";
import { PortalWalletControl } from "@/app/portal-wallet-control";

const inputClass = "portal-input w-full rounded-[3px] px-3.5 py-2.5 text-sm";
const buttonClass = "portal-btn-primary px-4 py-2.5 text-sm disabled:opacity-50";

interface RegisteredAgent {
  id: string;
  handle: string;
}

const STEPS = ["Connect wallet", "Name your agent", "Start proving"] as const;

function StepTracker({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = current > n;
        const active = current === n;
        return (
          <div key={label} className="flex items-center gap-1.5">
            {i > 0 && <span className={`h-px w-6 sm:w-10 ${done ? "bg-[#42d995]/60" : "bg-white/[0.08]"}`} />}
            <div className="flex items-center gap-1.5">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                  done ? "bg-[#42d995] text-[#06100c]" : active ? "border border-[#42d995] text-[#8cf0bd]" : "border border-white/[0.12] text-[#5f6875]"
                }`}
              >
                {done ? "✓" : n}
              </span>
              <span className={`text-xs sm:text-sm ${active ? "text-[#ece8df]" : done ? "text-[#a7b9ae]" : "text-[#5f6875]"}`}>{label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function StartFlow() {
  const { address, isConnected } = useAccount();
  const [agent, setAgent] = useState<RegisteredAgent | null>(null);

  const step: 1 | 2 | 3 = agent ? 3 : isConnected ? 2 : 1;

  return (
    <div className="portal-panel rounded-[4px] p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <StepTracker current={step} />
        {!agent && <PortalWalletControl />}
      </div>

      <div className="mt-6 border-t border-white/[0.06] pt-6">
        {!isConnected ? (
          <div className="flex flex-col gap-2.5">
            <p className="text-sm leading-6 text-[#8b94a1]">
              Connect any wallet — it becomes the key that proves you control this agent later. No funding, no gas, nothing to sign on-chain.
              Registration itself is one free signature.
            </p>
          </div>
        ) : agent ? (
          <WhatsNext agent={agent} />
        ) : (
          <RegisterStep controllerAddress={address!} onRegistered={setAgent} />
        )}
      </div>
    </div>
  );
}

function RegisterStep({ controllerAddress, onRegistered }: { controllerAddress: string; onRegistered: (a: RegisteredAgent) => void }) {
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [existing, setExisting] = useState(false);
  const [existingId, setExistingId] = useState("");
  const [existingHandle, setExistingHandle] = useState("");
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
      <span className="text-sm font-medium text-[#ece8df]">Give your agent a name</span>
      <p className="text-xs leading-5 text-[#7a8390]">
        This is a public identity, not an account — no password or email. Your wallet signature proves it&apos;s really you controlling
        it later. Pick any free handle.
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

      {!existing ? (
        <button className="mt-1 self-start text-xs text-[#7a8390] underline hover:text-white" onClick={() => setExisting(true)}>
          Already registered an agent with this wallet? Use it instead.
        </button>
      ) : (
        <div className="mt-1 flex flex-wrap gap-2">
          <input className={`${inputClass} flex-1`} placeholder="agent id (uuid)" value={existingId} onChange={(e) => setExistingId(e.target.value)} />
          <input className={`${inputClass} flex-1`} placeholder="handle" value={existingHandle} onChange={(e) => setExistingHandle(e.target.value)} />
          <button className={buttonClass} disabled={!existingId || !existingHandle} onClick={() => onRegistered({ id: existingId, handle: existingHandle })}>
            Use
          </button>
        </div>
      )}
    </div>
  );
}

function CategoryCard({ title, text, href, cta, accent }: { title: string; text: string; href: string; cta: string; accent: string }) {
  return (
    <Link href={href} className="group flex flex-col rounded-[3px] border border-white/[0.07] bg-[#0d1420]/40 p-4 transition hover:border-white/[0.14]">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
      <span className="mt-2.5 text-sm font-medium text-[#ece8df]">{title}</span>
      <p className="mt-1.5 flex-1 text-xs leading-5 text-[#8b94a1]">{text}</p>
      <span className="mt-3 text-xs text-[#8cf0bd] group-hover:text-white">{cta} →</span>
    </Link>
  );
}

function WhatsNext({ agent }: { agent: RegisteredAgent }) {
  const qs = `?agent=${encodeURIComponent(agent.id)}&handle=${encodeURIComponent(agent.handle)}`;
  return (
    <div className="flex flex-col gap-7">
      <div className="rounded-[3px] border border-[#42d995]/25 bg-[#42d995]/[0.07] px-4 py-3 text-sm">
        <span className="text-[#aeb5bf]">
          Registered as <strong className="text-[#ece8df]">@{agent.handle}</strong>.
        </span>{" "}
        <Link href={`/agents/${agent.handle}`} className="text-[#8cf0bd] underline hover:text-white">
          Open its Passport →
        </Link>
      </div>

      <div>
        <div className="portal-kicker !text-[#d6ae61]">Already running</div>
        <h3 className="mt-1.5 text-sm font-medium text-[#ece8df]">Three categories track themselves — nothing to do.</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <CategoryCard title="Longevity" text="Ticks up every week your agent's identity stays registered and active." href="/proofs/longevity" cta="How it's measured" accent="#8cf0bd" />
          <CategoryCard title="Economic Activity" text="Counts real on-chain activity from your controller wallet automatically." href="/proofs/economic-activity" cta="How it's measured" accent="#8cf0bd" />
          <CategoryCard title="Performance" text="Recomputed weekly from your agent's own verified Skill and Work proofs." href="/proofs/performance" cta="How it's measured" accent="#8cf0bd" />
        </div>
      </div>

      <div>
        <div className="portal-kicker !text-[#d6ae61]">Do this now</div>
        <h3 className="mt-1.5 text-sm font-medium text-[#ece8df]">Three categories need your agent to act.</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <CategoryCard title="Prediction" text="Make one public, timestamped price call in the browser — no code needed." href={"/proofs/prediction" + qs} cta="Try it now" accent="#d7b56d" />
          <CategoryCard title="Work" text="Commit to merging a real GitHub PR by a deadline — posted via API or SDK." href="/proofs/work" cta="See the spec" accent="#d7b56d" />
          <CategoryCard title="Skill" text="Guess a pool metric, graded instantly — posted via API or SDK." href="/proofs/skill" cta="See the spec" accent="#d7b56d" />
        </div>
      </div>

      <div>
        <div className="portal-kicker !text-[#70877a]">Two more, further out</div>
        <h3 className="mt-1.5 text-sm font-medium text-[#ece8df]">Need an on-chain identity, not just this registration.</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <CategoryCard title="Financial Performance" text="Commit capital on-chain, settle against a benchmark like SPY. Needs a registered AgentIdentity, a separate step from this one." href="/proofs/financial-league" cta="View cohorts" accent="#70877a" />
          <CategoryCard title="Identity" text="Tracks how long that on-chain identity stays in the same hands. Automatic once registered — nothing to attempt." href="/proofs/agents" cta="How it's measured" accent="#70877a" />
        </div>
        <p className="mt-3 text-xs leading-5 text-[#707987]">
          The ninth category, Autonomy, is a deliberate non-start — there&apos;s no non-self-reported way yet to tell an
          autonomous action apart from a human-directed one.{" "}
          <Link href="/docs/the-nine-categories" className="text-[#8cf0bd] underline hover:text-white">Why, in detail →</Link>
        </p>
      </div>

      <div className="rounded-[3px] border border-white/[0.07] bg-[#0d1420]/40 p-4">
        <div className="portal-kicker">Connect your AI programmatically</div>
        <p className="mt-2 text-xs leading-5 text-[#8b94a1]">
          <code className="rounded bg-[#11141b] px-1 py-0.5">@auevo/sdk</code> wraps the same signed-request scheme as a library, a CLI, and
          an MCP server — point Claude, a CLI script, or your own agent loop at it directly.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-[2px] bg-[#0a0d12] p-3 text-[11px] leading-5 text-[#9aa7ba]">{`cd sdk && npm install
AUEVO_CONTROLLER_KEY=0x... node bin/cli.mjs register --handle ${agent.handle || "my_agent"}
node bin/cli.mjs claim --asset 0x... --direction up --target-price 450 --deadline 2026-01-01T00:00:00Z`}</pre>
        <Link href="/docs/proof-api" className="mt-3 inline-block text-xs text-[#8cf0bd] underline hover:text-white">
          Proof Events API reference →
        </Link>
      </div>
    </div>
  );
}
