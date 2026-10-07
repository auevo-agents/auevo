"use client";

import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { CrystalForest, type TrialOutcome } from "../crystal-forest";
import { loadHostedAgent } from "@/app/hosted-agent";
import { isEntityKind, type EntityKind } from "./entity-catalog";
import type { ForestAgent } from "../forest-model";

/**
 * Independent copy of the same signed-envelope helpers used by
 * skill-try-it.tsx and prediction-try-it.tsx — this codebase already
 * tolerates this duplication across trust-boundary-scoped client files
 * rather than reaching into a shared module (see skill-try-it.tsx's own
 * header comment on the same pattern).
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

/**
 * Wraps the single-agent CrystalForest with owner-only "Save appearance"
 * persistence — the Passport page that mounts this is a Server Component
 * and can't hand CrystalForest a function prop directly (onEntityPreview
 * has to come from a Client Component), so this is that boundary.
 */
export function AgentAppearanceGarden({
  tree,
  isHosted,
  controllerAddress,
  initialEntityKind,
}: {
  tree: ForestAgent;
  isHosted: boolean;
  controllerAddress: string;
  initialEntityKind: EntityKind | null;
}) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [entityKind, setEntityKind] = useState<EntityKind | null>(initialEntityKind);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- wallet/localStorage identity is only known client-side, same pattern as useWalletAgent (wallet-agent.tsx)
    setIsOwner(isHosted ? loadHostedAgent()?.id === tree.id : address != null && address.toLowerCase() === controllerAddress.toLowerCase());
  }, [isHosted, address, controllerAddress, tree.id]);

  async function handlePreview(_id: string, kind: EntityKind) {
    setStatus("idle");
    setError(null);
    if (!isOwner) return; // Guest preview only — CrystalForest already updated the 3D view locally; nothing to persist.
    setStatus("saving");
    try {
      const path = `/api/agents/${tree.id}/appearance`;
      let res: Response;
      if (isHosted) {
        const hosted = loadHostedAgent();
        if (!hosted || hosted.id !== tree.id) throw new Error("This browser's hosted-agent session no longer matches this agent");
        res = await fetch(path, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runSecret: hosted.runSecret, entityKind: kind }),
        });
      } else {
        const payload = JSON.stringify({ entityKind: kind });
        const timestamp = Date.now();
        const nonce = hexNonce();
        const message = canonicalMessage("PATCH", path, timestamp, nonce, await sha256Hex(payload));
        const signature = await signMessageAsync({ message });
        res = await fetch(path, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ payload, timestamp, nonce, signature }),
        });
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setEntityKind(kind);
      setStatus("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save appearance");
      setStatus("error");
    }
  }

  async function handleTryTrial(id: string): Promise<TrialOutcome | { error: string }> {
    const hosted = loadHostedAgent();
    if (!isHosted || !isOwner || !hosted || hosted.id !== id) return { error: "Connect as this agent's owner to run a real trial." };
    try {
      const res = await fetch(`/api/agents/${id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runSecret: hosted.runSecret, category: "prediction" }),
      });
      const json = await res.json();
      if (!res.ok) return { error: json.error || `HTTP ${res.status}` };
      return json as TrialOutcome;
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Trial run failed" };
    }
  }

  return (
    <div>
      <CrystalForest
        single
        agents={[tree]}
        entityKinds={entityKind && isEntityKind(entityKind) ? { [tree.id]: entityKind } : undefined}
        onEntityPreview={handlePreview}
        onTryTrial={isHosted && isOwner ? handleTryTrial : undefined}
      />
      <div className="mt-2 px-1 text-xs">
        {isOwner ? (
          status === "saving" ? (
            <span className="text-[#d7b56d]">Saving appearance…</span>
          ) : status === "saved" ? (
            <span className="text-[#8cf0bd]">Appearance saved — visible to everyone.</span>
          ) : status === "error" ? (
            <span className="text-[#ff7b82]">{error ?? "Could not save appearance"}</span>
          ) : (
            <span className="text-[#7a8390]">Pick a companion above — it saves automatically for your agent.</span>
          )
        ) : (
          <span className="text-[#7a8390]">Appearance preview only — connect as this agent&apos;s owner to save a choice.</span>
        )}
      </div>
    </div>
  );
}
