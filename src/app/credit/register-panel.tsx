"use client";

import { useEffect, useRef, useState } from "react";
import { type Address, decodeEventLog } from "viem";
import { useAccount, useBalance, useReadContract, useSignMessage, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import Link from "next/link";
import { ConnectButton } from "@/app/rwa/app/connect-button";
import { AGENT_CREDIT_POOL_ABI } from "@/lib/credit/abi";
import { CREDIT_IDENTITY_WRITE_ABI } from "@/lib/credit/identity-abi";
import { useWalletAgent } from "@/app/wallet-agent";
import { InfoTip } from "@/app/info-tip";
import { ROBINHOOD_CHAIN_ID } from "@/lib/chains";
import { txErrorMessage } from "@/app/credit/tx-error";

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
  const { address, isConnected, chainId } = useAccount();
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

  // A fresh registration is known from the just-sent tx's own receipt. A
  // RELOAD has no such receipt — this contract has no "does this address
  // already have an id" view, so without this lookup every reload forgot
  // the id entirely and re-showed the register button, inviting a second,
  // wasted registration.
  const [existingLookup, setExistingLookup] = useState<"idle" | "checking" | "done">("idle");
  useEffect(() => {
    if (!address) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExistingLookup("idle");
      return;
    }
    let cancelled = false;
    setExistingLookup("checking");
    fetch(`/api/credit/agent-id?address=${address}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled) return;
        if (json?.agentId) setNewAgentId(BigInt(json.agentId));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setExistingLookup("done");
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

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

  const { data: gasBalance } = useBalance({ address, chainId: ROBINHOOD_CHAIN_ID, query: { enabled: Boolean(address) && chainId === ROBINHOOD_CHAIN_ID } });
  const noGas = chainId === ROBINHOOD_CHAIN_ID && gasBalance !== undefined && gasBalance.value === 0n;

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
      ) : existingLookup !== "done" ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Checking whether this wallet already has a credit agent id…</p>
      ) : newAgentId === null ? (
        <div className="mt-3 flex flex-col gap-2">
          {agent && <p className="text-xs text-[var(--muted)]">Registering will tag this id with your AUEVO handle, @{agent.handle}.</p>}
          {noGas && (
            <p className="text-xs text-[var(--red)]">
              This wallet has 0 {gasBalance?.symbol ?? "gas token"} on Robinhood Chain — the transaction will fail without it. Robinhood
              Chain has its own gas balance, separate from any other chain your wallet holds funds on; bridge some over on{" "}
              <Link href="/rwa/app/swap" className="underline hover:text-white">
                the swap page
              </Link>{" "}
              first.
            </p>
          )}
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
          {register.error && <p className="text-xs text-[var(--red)]">{txErrorMessage(register.error)}</p>}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-[3px] border border-[var(--green)]/30 bg-[var(--green)]/[0.06] px-3 py-2.5">
            <div>
              <div className="text-[10px] uppercase tracking-[.08em] text-[var(--muted)]">Your credit agent id</div>
              <div className="font-mono text-2xl font-semibold text-[var(--ink)]">#{newAgentId.toString()}</div>
            </div>
            <a className="ml-auto text-sm text-[var(--green)] underline hover:text-white" href={`/credit/agent?id=${newAgentId.toString()}`}>
              Open it →
            </a>
          </div>
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
