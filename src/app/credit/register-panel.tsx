"use client";

import { useEffect, useRef, useState } from "react";
import { type Address, decodeEventLog } from "viem";
import { useAccount, useReadContract, useSignMessage, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { ConnectButton } from "@/app/rwa/app/connect-button";
import { AGENT_CREDIT_POOL_ABI } from "@/lib/credit/abi";
import { CREDIT_IDENTITY_WRITE_ABI } from "@/lib/credit/identity-abi";
import { useWalletAgent } from "@/app/wallet-agent";
import { InfoTip } from "@/app/info-tip";
import { ROBINHOOD_CHAIN_ID } from "@/lib/chains";

const inputClass = "rounded border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 text-sm";
const buttonClass = "rounded bg-[var(--ink)] px-4 py-2 text-sm text-[var(--bg)] disabled:opacity-50";

/**
 * The missing first step the rest of credit-agent-actions.tsx assumed
 * already happened: getting a numeric id on the SEPARATE Credit identity
 * registry in the first place. register() on that contract is open to
 * anyone (see AgentIdentity.sol) — this just calls it with a connected
 * wallet, reads the new agentId back out of the Registered event the
 * same transaction emits, and — when this wallet is also a "Connect your
 * agent" handle's controller_address — offers to link the two so future
 * lookups work by handle (see /api/credit/link, src/lib/credit/link.ts).
 */
export function RegisterForCreditPanel({ pool }: { pool: Address }) {
  const { address, isConnected } = useAccount();
  const { agent } = useWalletAgent(address);

  const { data: identityAddress, isLoading: identityLoading, isError: identityErrored } = useReadContract({
    address: pool,
    abi: AGENT_CREDIT_POOL_ABI,
    functionName: "identity",
    chainId: ROBINHOOD_CHAIN_ID,
  });

  const register = useWriteContract();
  const registerReceipt = useWaitForTransactionReceipt({ hash: register.data });

  const [newAgentId, setNewAgentId] = useState<bigint | null>(null);
  const decodedTx = useRef<string | null>(null);

  useEffect(() => {
    if (!registerReceipt.data || !identityAddress || decodedTx.current === registerReceipt.data.transactionHash) return;
    for (const log of registerReceipt.data.logs) {
      if (log.address.toLowerCase() !== identityAddress.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: CREDIT_IDENTITY_WRITE_ABI, data: log.data, topics: log.topics });
        if (decoded.eventName === "Registered") {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setNewAgentId(decoded.args.agentId);
          decodedTx.current = registerReceipt.data.transactionHash;
          break;
        }
      } catch {
        // not the Registered log — e.g. the ControllerSet/OperatorWalletSet events this same tx also emits
      }
    }
  }, [registerReceipt.data, identityAddress]);

  const { signMessageAsync } = useSignMessage();
  const [linkStatus, setLinkStatus] = useState<"idle" | "linking" | "linked" | "error">("idle");
  const [linkError, setLinkError] = useState<string | null>(null);

  async function handleLink() {
    if (!agent || newAgentId === null || !address) return;
    setLinkStatus("linking");
    setLinkError(null);
    try {
      const timestamp = Date.now();
      const message = `link-credit\n${agent.handle}\n${newAgentId.toString()}\n${timestamp}`;
      const signature = await signMessageAsync({ message });
      const res = await fetch("/api/credit/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: agent.handle, address, agentId: newAgentId.toString(), timestamp, signature }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Link failed (${res.status})`);
      }
      setLinkStatus("linked");
    } catch (err) {
      setLinkStatus("error");
      setLinkError(err instanceof Error ? err.message : "Link failed");
    }
  }

  return (
    <div className="rounded-[3px] border border-[var(--line)] bg-[var(--panel)] p-4">
      <h3 className="flex items-center font-medium">
        Get a credit agent id
        <InfoTip text="Credit uses its own separate id registry from the rest of AUEVO — your Passport handle isn't automatically usable here. This mints one, in one click, with no backend gatekeeping: anyone can call it." />
      </h3>
      <p className="mt-1 text-xs text-[var(--muted)]">
        One real on-chain transaction, free function call (just gas) — mints a fresh numeric id you own, which is what every action below (back, borrow, repay) actually keys off.
      </p>

      {!isConnected ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm text-[var(--muted)]">Connect a wallet to register.</span>
          <ConnectButton />
        </div>
      ) : newAgentId === null ? (
        <div className="mt-3 flex flex-col gap-2">
          {agent && <p className="text-xs text-[var(--muted)]">Registering will tag this id with your AUEVO handle, @{agent.handle}.</p>}
          <button
            className={buttonClass}
            disabled={!identityAddress || register.isPending || registerReceipt.isLoading}
            onClick={() =>
              register.writeContract({
                chainId: ROBINHOOD_CHAIN_ID,
                address: identityAddress!,
                abi: CREDIT_IDENTITY_WRITE_ABI,
                functionName: "register",
                args: [agent ? `auevo:${agent.handle}` : ""],
              })
            }
          >
            {identityLoading ? "Checking contract…" : register.isPending || registerReceipt.isLoading ? "Registering…" : "Register for credit"}
          </button>
          {identityErrored && (
            <p className="text-xs text-[var(--red)]">Couldn&apos;t read the pool&apos;s identity registry — check your wallet is on Robinhood Chain.</p>
          )}
          {register.error && <p className="text-xs text-[var(--red)]">{register.error.message}</p>}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm text-[var(--green)]">
            Registered — your credit agent id is <span className="font-mono text-[var(--ink)]">{newAgentId.toString()}</span>.{" "}
            <a className="underline hover:text-white" href={`/credit/agent?id=${newAgentId.toString()}`}>
              Open it →
            </a>
          </p>
          {agent && linkStatus !== "linked" && (
            <>
              <button className={inputClass + " text-left"} disabled={linkStatus === "linking"} onClick={handleLink}>
                {linkStatus === "linking" ? "Linking…" : `Also link this to @${agent.handle}, so /credit/agent can find it by handle`}
              </button>
              {linkError && <p className="text-xs text-[var(--red)]">{linkError}</p>}
            </>
          )}
          {linkStatus === "linked" && <p className="text-xs text-[var(--green)]">Linked to @{agent!.handle}.</p>}
        </div>
      )}
    </div>
  );
}
