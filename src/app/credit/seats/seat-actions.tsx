"use client";

import { useMemo, useState } from "react";
import { type Address, parseUnits } from "viem";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@/app/rwa/app/connect-button";
import { AGENT_CREDIT_POOL_ABI } from "@/lib/credit/abi";
import { ERC20_ABI } from "@/lib/erc20-abi";
import { ROBINHOOD_CHAIN_ID } from "@/lib/chains";
import { WrongNetworkBanner } from "@/app/credit/wrong-network-banner";

const inputClass = "rounded border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 text-sm";
const buttonClass = "rounded bg-[var(--ink)] px-4 py-2 text-sm text-[var(--bg)] disabled:opacity-50";

/**
 * Backs an agent with a seat — same consent-based flow as an ordinary
 * vouch() (see /credit/agent's "sign a consent" step 1 panel; paste that
 * same JSON here), plus the seatToken lock vouchSeat() requires. Gated
 * client-side by seatEligible() before anything is submitted, so a visitor
 * sees why it's blocked rather than a bare revert.
 */
export function SeatActions({
  pool,
  assetDecimals,
  seatTokenAddress,
  seatTokenDecimals,
}: {
  pool: Address;
  assetDecimals: number;
  seatTokenAddress: Address;
  seatTokenDecimals: number;
}) {
  const { isConnected, address } = useAccount();

  const [agentIdStr, setAgentIdStr] = useState("");
  const [pasted, setPasted] = useState("");
  const [amount, setAmount] = useState("");
  const [premiumBps, setPremiumBps] = useState("0");

  const agentId = useMemo(() => {
    try {
      return agentIdStr ? BigInt(agentIdStr) : null;
    } catch {
      return null;
    }
  }, [agentIdStr]);

  const { data: eligible } = useReadContract({
    address: pool,
    abi: AGENT_CREDIT_POOL_ABI,
    functionName: "seatEligible",
    args: agentId !== null ? [agentId] : undefined,
    query: { enabled: agentId !== null },
    chainId: ROBINHOOD_CHAIN_ID,
  });

  const { data: isRoot } = useReadContract({
    address: pool,
    abi: AGENT_CREDIT_POOL_ABI,
    functionName: "isRoot",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
    chainId: ROBINHOOD_CHAIN_ID,
  });

  const parsedConsent = useMemo(() => {
    try {
      const obj = JSON.parse(pasted);
      if (agentId !== null && BigInt(obj.agentId) !== agentId) return { error: "this consent is for a different agent id" };
      return {
        maxPremiumBps: Number(obj.maxPremiumBps),
        nonce: BigInt(obj.nonce),
        deadline: BigInt(obj.deadline),
        signature: obj.signature as `0x${string}`,
      };
    } catch {
      return pasted ? { error: "couldn't parse that — paste the exact JSON from the agent's sign-consent step" } : null;
    }
  }, [pasted, agentId]);

  const parsedAmount = useMemo(() => {
    try {
      return amount ? parseUnits(amount, assetDecimals) : null;
    } catch {
      return null;
    }
  }, [amount, assetDecimals]);

  const { data: seatTokenRequired } = useReadContract({
    address: pool,
    abi: AGENT_CREDIT_POOL_ABI,
    functionName: "seatTokenRequiredFor",
    args: parsedAmount !== null ? [parsedAmount] : undefined,
    query: { enabled: parsedAmount !== null },
    chainId: ROBINHOOD_CHAIN_ID,
  });

  const approve = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });
  const vouchSeat = useWriteContract();
  const vouchSeatReceipt = useWaitForTransactionReceipt({ hash: vouchSeat.data });

  const consent = parsedConsent && !("error" in parsedConsent) ? parsedConsent : null;
  const premium = Number(premiumBps) || 0;
  const canSubmit =
    agentId !== null &&
    eligible === true &&
    isRoot === true &&
    consent &&
    parsedAmount &&
    seatTokenRequired !== undefined &&
    premium <= consent.maxPremiumBps;

  function handleSubmit() {
    if (!canSubmit || agentId === null || !consent || !parsedAmount || seatTokenRequired === undefined) return;
    approve.writeContract(
      { chainId: ROBINHOOD_CHAIN_ID, address: seatTokenAddress, abi: ERC20_ABI, functionName: "approve", args: [pool, seatTokenRequired] },
      {
        onSuccess: () =>
          vouchSeat.writeContract({
            chainId: ROBINHOOD_CHAIN_ID,
            address: pool,
            abi: AGENT_CREDIT_POOL_ABI,
            functionName: "vouchSeat",
            args: [agentId, parsedAmount, premium, consent.maxPremiumBps, consent.nonce, consent.deadline, consent.signature],
          }),
      }
    );
  }

  return (
    <div className="rounded-[3px] border border-[var(--line)] bg-[var(--panel)] p-4">
      <h3 className="font-medium">Back an agent with a seat</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Needs a consent signed by the agent&apos;s owner first — get that from the &quot;sign a consent&quot; panel on{" "}
        <code className="rounded bg-[var(--panel-2)] px-1 py-0.5">/credit/agent?id=&lt;id&gt;</code>, naming your own
        address as the sponsor. You must already be enrolled as a root (deposit + enrollRoot on the Pool page) to use
        a seat, same as an ordinary vouch.
      </p>

      {!isConnected ? (
        <div className="mt-3 flex items-center justify-between rounded-[3px] border border-[var(--line)] bg-[var(--panel-2)] p-3">
          <span className="text-sm text-[var(--muted)]">Connect a wallet to back an agent.</span>
          <ConnectButton />
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <WrongNetworkBanner />
          <input
            className={inputClass}
            placeholder="agent id"
            value={agentIdStr}
            onChange={(e) => setAgentIdStr(e.target.value)}
            inputMode="numeric"
          />
          {agentId !== null && eligible === false && (
            <p className="text-xs text-[var(--red)]">
              This agent does not have enough repaid loans yet — a seat can only back an agent with
              SEAT_MIN_REPAID_LOANS or more.
            </p>
          )}
          {isRoot === false && <p className="text-xs text-[var(--red)]">Your address is not enrolled as a root yet.</p>}

          <textarea
            className={`${inputClass} font-mono text-xs`}
            rows={5}
            placeholder="paste the owner's signed consent JSON here"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          {parsedConsent && "error" in parsedConsent && <p className="text-xs text-[var(--red)]">{parsedConsent.error}</p>}

          <input className={inputClass} placeholder="amount to vouch (USDG)" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          <input
            className={inputClass}
            placeholder={`your premium in bps (0–${consent?.maxPremiumBps ?? "…"})`}
            value={premiumBps}
            onChange={(e) => setPremiumBps(e.target.value)}
          />

          {seatTokenRequired !== undefined && parsedAmount !== null && (
            <p className="text-xs text-[var(--muted)]">
              Locks {formatUnits(seatTokenRequired, seatTokenDecimals)} of the seat token for this seat — burned 50% if the
              loan it backs defaults, returned in full otherwise once the agent can no longer borrow from this pool.
            </p>
          )}

          <button className={buttonClass} disabled={!canSubmit || approve.isPending || approveReceipt.isLoading || vouchSeat.isPending || vouchSeatReceipt.isLoading} onClick={handleSubmit}>
            {approve.isPending || approveReceipt.isLoading
              ? "Approving seat token…"
              : vouchSeat.isPending || vouchSeatReceipt.isLoading
                ? "Backing with seat…"
                : "Approve & back with seat"}
          </button>
          {vouchSeatReceipt.isSuccess && <p className="text-xs text-[var(--green)]">Seat opened.</p>}
          {(approve.error || vouchSeat.error) && (
            <p className="text-xs text-[var(--red)]">{(approve.error ?? vouchSeat.error)?.message}</p>
          )}
        </div>
      )}
    </div>
  );
}

function formatUnits(value: bigint, decimals: number): string {
  if (decimals === 0) return value.toString();
  const s = value.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, -decimals);
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
