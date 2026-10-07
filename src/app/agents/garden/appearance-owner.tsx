"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { CrystalForest, type TrialOutcome } from "../crystal-forest";
import { loadHostedAgent } from "@/app/hosted-agent";
import { isEntityKind, type EntityKind } from "./entity-catalog";
import type { ForestAgent } from "../forest-model";

/**
 * Wraps the single-agent CrystalForest with the owner-only "Run a real
 * trial" action — the Passport page that mounts this is a Server Component
 * and can't hand CrystalForest a function prop directly (onTryTrial has to
 * come from a Client Component), so this is that boundary. Appearance
 * (entityKind) is fixed to whatever was chosen at agent creation — the
 * Passport no longer offers a picker to change it, so there's nothing here
 * to save, only to display.
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
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- wallet/localStorage identity is only known client-side, same pattern as useWalletAgent (wallet-agent.tsx)
    setIsOwner(isHosted ? loadHostedAgent()?.id === tree.id : address != null && address.toLowerCase() === controllerAddress.toLowerCase());
  }, [isHosted, address, controllerAddress, tree.id]);

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
    <CrystalForest
      single
      agents={[tree]}
      entityKinds={initialEntityKind && isEntityKind(initialEntityKind) ? { [tree.id]: initialEntityKind } : undefined}
      onTryTrial={isHosted && isOwner ? handleTryTrial : undefined}
    />
  );
}
