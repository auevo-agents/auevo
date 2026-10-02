import { maxUint256, type Address } from "viem";
import { readContract, sendTransaction, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import type { LiFiStep, Route, StatusResponse } from "@lifi/types";
import { getWagmiConfig } from "@/lib/wagmi";
import { ERC20_ABI } from "@/lib/erc20-abi";
import { explorerTxUrl } from "@/lib/rwa/lifi/chains";

/**
 * Drives one LI.FI Route to completion — RWA_SPEC.md Phase 4's "оверлей
 * шагов (approve → send → bridge → receive) со ссылками на эксплореры,
 * статусы через LI.FI /status".
 *
 * Uses wagmi's imperative `wagmi/actions` (not hooks) throughout: this
 * runs as one long async sequence triggered by a single button press,
 * looping over an a-priori-unknown number of steps/chains, which is
 * exactly the case hooks-in-a-callback can't express (hooks must be
 * called unconditionally, the same number of times, on every render).
 *
 * Well-known industry-wide sentinel for "this leg's currency is the
 * chain's native gas token, not an ERC-20" — LI.FI included, per general
 * EVM-tooling convention (0x/1inch/Socket/Rango all use the same value).
 * This session could not confirm it against LI.FI's own live docs
 * (li.quest is blocked from this sandbox) — if it's ever wrong for some
 * chain, LI.FI's API/router rejects the request rather than silently
 * moving funds to the wrong place, so getting this wrong fails closed.
 */
export const LIFI_NATIVE_ADDRESS = "0x0000000000000000000000000000000000000000";

export type StepPhase = "waiting" | "switching-chain" | "approving" | "building" | "sending" | "confirming" | "bridging" | "done" | "failed";

export interface StepLog {
  index: number;
  label: string;
  chainId: number;
  toChainId: number;
  phase: StepPhase;
  txHash?: string;
  explorerUrl?: string;
  error?: string;
}

function isNative(address: string): boolean {
  return address.toLowerCase() === LIFI_NATIVE_ADDRESS;
}

async function recordTransfer(body: Record<string, unknown>): Promise<number | null> {
  try {
    const res = await fetch("/api/dex/record", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return typeof data.id === "number" ? data.id : null;
  } catch {
    return null;
  }
}

async function patchTransfer(id: number | null, body: Record<string, unknown>): Promise<void> {
  if (id === null) return;
  await fetch("/api/dex/record", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, ...body }),
  }).catch(() => {});
}

async function pollStatus(params: { bridge: string; fromChain: number; toChain: number; txHash: string }): Promise<StatusResponse> {
  const maxAttempts = 120; // ~10 minutes at 5s intervals
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const query = new URLSearchParams({
      bridge: params.bridge,
      fromChain: String(params.fromChain),
      toChain: String(params.toChain),
      txHash: params.txHash,
    });
    const res = await fetch(`/api/lifi/status?${query}`);
    const data: StatusResponse = await res.json();
    if (data.status === "DONE" || data.status === "FAILED") return data;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("Status polling timed out — check /app/explorer for the final state");
}

/**
 * Executes every step of `route` in order, calling `onUpdate` with the
 * full log array after every state change so the caller can just render
 * whatever it was last given. Throws on the first failed step — the
 * caller's log will show which step and why.
 */
export async function executeRoute(params: { route: Route; account: Address; onUpdate: (logs: StepLog[]) => void }): Promise<void> {
  const config = getWagmiConfig();
  const logs: StepLog[] = params.route.steps.map((step, index) => ({
    index,
    label: `${step.tool} · ${step.action.fromToken.symbol} → ${step.action.toToken.symbol}`,
    chainId: step.action.fromChainId,
    toChainId: step.action.toChainId,
    phase: "waiting",
  }));
  const emit = () => params.onUpdate([...logs]);
  emit();

  for (let i = 0; i < params.route.steps.length; i++) {
    const step = params.route.steps[i];
    const log = logs[i];
    const crossChain = step.action.fromChainId !== step.action.toChainId;
    let recordId: number | null = null;

    try {
      log.phase = "switching-chain";
      emit();
      await switchChain(config, { chainId: step.action.fromChainId });

      if (!isNative(step.action.fromToken.address)) {
        log.phase = "approving";
        emit();
        const approvalAddress = step.estimate?.approvalAddress;
        if (!approvalAddress) throw new Error("LI.FI did not return an approval address for this step");
        const allowance = await readContract(config, {
          address: step.action.fromToken.address as Address,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [params.account, approvalAddress as Address],
          chainId: step.action.fromChainId,
        });
        if (allowance < BigInt(step.action.fromAmount)) {
          const approveHash = await writeContract(config, {
            address: step.action.fromToken.address as Address,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [approvalAddress as Address, maxUint256],
            chainId: step.action.fromChainId,
          });
          await waitForTransactionReceipt(config, { hash: approveHash, chainId: step.action.fromChainId });
        }
      }

      log.phase = "building";
      emit();
      const stepRes = await fetch("/api/lifi/step-transaction", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(step),
      });
      const builtStep: LiFiStep = await stepRes.json();
      if (!stepRes.ok || !builtStep.transactionRequest) {
        throw new Error((builtStep as unknown as { error?: string }).error ?? "Could not build this step's transaction");
      }
      const tr = builtStep.transactionRequest;

      recordId = await recordTransfer({
        account: params.account,
        recipient: step.action.toAddress ?? params.account,
        chainId: step.action.fromChainId,
        toChainId: crossChain ? step.action.toChainId : undefined,
        srcToken: step.action.fromToken.address,
        dstToken: step.action.toToken.address,
        amountIn: step.action.fromAmount,
        route: step.tool,
        bridgeTool: crossChain ? step.tool : undefined,
        feeBps: 0, // LI.FI's own integrator fee, if any, is taken by LI.FI itself — not a separate on-chain transfer this app records
      });

      log.phase = "sending";
      emit();
      const hash = await sendTransaction(config, {
        to: tr.to as Address,
        data: tr.data as `0x${string}`,
        value: tr.value ? BigInt(tr.value) : undefined,
        chainId: step.action.fromChainId,
      });
      log.txHash = hash;
      log.explorerUrl = explorerTxUrl(step.action.fromChainId, hash) ?? undefined;
      emit();

      log.phase = "confirming";
      emit();
      await waitForTransactionReceipt(config, { hash, chainId: step.action.fromChainId });

      if (crossChain) {
        log.phase = "bridging";
        emit();
        const status = await pollStatus({ bridge: step.tool, fromChain: step.action.fromChainId, toChain: step.action.toChainId, txHash: hash });
        if (status.status === "FAILED") {
          throw new Error(status.substatusMessage ?? "The bridge reported this transfer failed");
        }
      }

      log.phase = "done";
      emit();
      await patchTransfer(recordId, { txHash: hash, status: "done" });
    } catch (err) {
      log.phase = "failed";
      log.error = err instanceof Error ? err.message : "Unknown error";
      emit();
      await patchTransfer(recordId, { status: "failed" });
      throw err;
    }
  }
}
