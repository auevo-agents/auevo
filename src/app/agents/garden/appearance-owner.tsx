"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { CrystalForest, type TrialOutcome } from "../crystal-forest";
import { loadHostedAgent } from "@/app/hosted-agent";
import { isEntityKind, type EntityKind } from "./entity-catalog";
import type { ForestAgent } from "../forest-model";

type AutonomyState = { enabled: boolean; runsPerDay: number; lastTriggeredAt: string | null } | null;

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
  const [autonomy, setAutonomy] = useState<AutonomyState>(null);
  const [autonomyBusy, setAutonomyBusy] = useState(false);
  const [autonomyError, setAutonomyError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- wallet/localStorage identity is only known client-side, same pattern as useWalletAgent (wallet-agent.tsx)
    setIsOwner(isHosted ? loadHostedAgent()?.id === tree.id : address != null && address.toLowerCase() === controllerAddress.toLowerCase());
  }, [isHosted, address, controllerAddress, tree.id]);

  useEffect(() => {
    const hosted = loadHostedAgent();
    if (!isHosted || !isOwner || !hosted || hosted.id !== tree.id) return;
    let cancelled = false;
    fetch(`/api/agents/${tree.id}/autonomy?runSecret=${encodeURIComponent(hosted.runSecret)}`)
      .then(res => res.json())
      .then(json => {
        if (!cancelled && !json.error) setAutonomy({ enabled: json.enabled, runsPerDay: json.runsPerDay, lastTriggeredAt: json.lastTriggeredAt });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isHosted, isOwner, tree.id]);

  const toggleAutonomy = useCallback(async () => {
    const hosted = loadHostedAgent();
    if (!isHosted || !isOwner || !hosted || hosted.id !== tree.id || !autonomy || autonomyBusy) return;
    setAutonomyBusy(true);
    setAutonomyError(null);
    try {
      const res = await fetch(`/api/agents/${tree.id}/autonomy`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runSecret: hosted.runSecret, enabled: !autonomy.enabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setAutonomy({ enabled: json.enabled, runsPerDay: json.runsPerDay, lastTriggeredAt: json.lastTriggeredAt });
    } catch (err) {
      setAutonomyError(err instanceof Error ? err.message : "Could not update autonomy");
    } finally {
      setAutonomyBusy(false);
    }
  }, [isHosted, isOwner, tree.id, autonomy, autonomyBusy]);

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
    <>
      <CrystalForest
        single
        agents={[tree]}
        entityKinds={initialEntityKind && isEntityKind(initialEntityKind) ? { [tree.id]: initialEntityKind } : undefined}
        onTryTrial={isHosted && isOwner ? handleTryTrial : undefined}
      />
      {isHosted && isOwner && autonomy && (
        <div className="mt-4 flex items-center justify-between gap-4 rounded-[3px] border border-[#425d3d70] bg-[#0e1f15] px-4 py-3.5 text-xs">
          <div>
            <div className="text-[#f1f1db]">Autonomous runs</div>
            <p className="mt-1 max-w-sm text-[11px] leading-5 text-[#9fb0a4]">
              {autonomy.enabled
                ? `AUEVO's own hourly cron triggers this agent on its own — up to ${autonomy.runsPerDay}/day.`
                : "Let AUEVO's own hourly cron trigger this agent on its own, instead of only on a manual click."}
            </p>
            {autonomyError && <p className="mt-1 text-[#e0735c]">{autonomyError}</p>}
          </div>
          <button
            type="button"
            onClick={toggleAutonomy}
            disabled={autonomyBusy}
            className={`shrink-0 rounded-[3px] border px-3 py-2 font-medium transition ${
              autonomy.enabled ? "border-[#6f885873] bg-[#183d28] text-[#8cf0bd]" : "border-[#697b5670] bg-[#0e281d] text-[#e7ead7]"
            } disabled:opacity-60`}
          >
            {autonomyBusy ? "Saving…" : autonomy.enabled ? "On · turn off" : "Turn on"}
          </button>
        </div>
      )}
    </>
  );
}
