"use client";

import { useMemo, useState } from "react";
import { type Address, isAddress, parseUnits } from "viem";
import { useAccount, useReadContract, useSignTypedData, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@/app/rwa/app/connect-button";
import { AGENT_CREDIT_POOL_ABI, CONSENT_EIP712_TYPES } from "@/lib/credit/abi";
import { ERC20_ABI } from "@/lib/erc20-abi";
import { ROBINHOOD_CHAIN_ID } from "@/lib/chains";
import { InfoTip } from "@/app/info-tip";

/**
 * Every action below sends a real transaction against a real pool the
 * moment NEXT_PUBLIC_CREDIT_POOL_ADDRESS is set — there is no testnet
 * mode here, same as the DCA bots page. Each panel is deliberately
 * narrow (one action, one set of inputs) rather than a single mega-form,
 * since these are four genuinely different roles (owner, sponsor,
 * lender, anyone-who-can-call-repay-or-markDefault) that most visitors
 * will only ever use one of.
 */
export function CreditAgentActions({ agentId, pool, assetDecimals }: { agentId: bigint; pool: Address; assetDecimals: number }) {
  const { isConnected } = useAccount();

  return (
    <div className="mt-8 flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-[3px] border border-[var(--line)] bg-[var(--panel)] p-4">
        <span className="text-sm text-[var(--muted)]">Connect a wallet to act on this agent — nothing here is held for you.</span>
        <ConnectButton />
      </div>

      {isConnected && (
        <>
          <SignConsentPanel agentId={agentId} pool={pool} />
          <LenderPanel pool={pool} assetDecimals={assetDecimals} />
          <VouchPanel agentId={agentId} pool={pool} assetDecimals={assetDecimals} />
          <BorrowPanel agentId={agentId} pool={pool} assetDecimals={assetDecimals} />
          <RepayPanel pool={pool} />
        </>
      )}
    </div>
  );
}

function Panel({ title, titleTip, hint, children }: { title: string; titleTip?: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[3px] border border-[var(--line)] bg-[var(--panel)] p-4">
      <h3 className="flex items-center font-medium">
        {title}
        {titleTip && <InfoTip text={titleTip} />}
      </h3>
      <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
      <div className="mt-3 flex flex-col gap-2">{children}</div>
    </div>
  );
}

const inputClass = "rounded border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 text-sm";
const buttonClass = "rounded bg-[var(--ink)] px-4 py-2 text-sm text-[var(--bg)] disabled:opacity-50";

/** Step 1, owner side: sign an EIP-712 consent naming one sponsor, off-chain, for free. */
function SignConsentPanel({ agentId, pool }: { agentId: bigint; pool: Address }) {
  const [sponsor, setSponsor] = useState("");
  const [maxPremiumBps, setMaxPremiumBps] = useState("0");
  const [result, setResult] = useState<string | null>(null);
  const { signTypedDataAsync, isPending, error } = useSignTypedData();

  const validSponsor = isAddress(sponsor, { strict: false }) ? (sponsor as Address) : undefined;

  async function handleSign() {
    if (!validSponsor) return;
    const nonce = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const maxPremium = Number(maxPremiumBps) || 0;

    const signature = await signTypedDataAsync({
      domain: { name: "AgentCreditPool", version: "1", chainId: ROBINHOOD_CHAIN_ID, verifyingContract: pool },
      types: CONSENT_EIP712_TYPES,
      primaryType: "Consent",
      message: { agentId, sponsor: validSponsor, maxPremiumBps: maxPremium, nonce, deadline },
    });

    setResult(
      JSON.stringify(
        { agentId: agentId.toString(), sponsor: validSponsor, maxPremiumBps: maxPremium, nonce: nonce.toString(), deadline: deadline.toString(), signature },
        null,
        2
      )
    );
  }

  return (
    <Panel
      title="1 — Sign a consent (agent owner)"
      titleTip="A 'consent' is a signed permission slip, not a transaction — it just names one sponsor allowed to back this agent and the most they could ever charge. No funds move at this step."
      hint="Only the identity's current owner signing this actually works — the pool re-checks that live, on chain, at vouch() time. Costs no gas: this never sends a transaction."
    >
      <input className={inputClass} placeholder="sponsor address (who you're letting back this agent)" value={sponsor} onChange={(e) => setSponsor(e.target.value)} />
      <input className={inputClass} placeholder="max premium you'll ever accept, in bps — 100 bps = 1% (0–200)" value={maxPremiumBps} onChange={(e) => setMaxPremiumBps(e.target.value)} />
      <button className={buttonClass} disabled={!validSponsor || isPending} onClick={handleSign}>
        {isPending ? "Signing…" : "Sign consent"}
      </button>
      {error && <p className="text-xs text-[var(--red)]">{error.message}</p>}
      {result && (
        <div>
          <p className="text-xs text-[var(--muted)]">Send this to the sponsor — they paste it into their vouch form below.</p>
          <textarea className={`${inputClass} mt-1 w-full font-mono text-xs`} rows={6} readOnly value={result} />
        </div>
      )}
    </Panel>
  );
}

/** Lenders AND sponsors both deposit into the same share pool — see AgentCreditPool.sol. Exported so /credit's own landing page can offer it directly, not just this agent-specific page. */
export function LenderPanel({ pool, assetDecimals }: { pool: Address; assetDecimals: number }) {
  const { address } = useAccount();
  const { data: assetAddress } = useReadContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "asset" });
  const { data: isRoot, refetch: refetchIsRoot } = useReadContract({
    address: pool,
    abi: AGENT_CREDIT_POOL_ABI,
    functionName: "isRoot",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const [amount, setAmount] = useState("");
  const parsed = useMemo(() => {
    try {
      return amount ? parseUnits(amount, assetDecimals) : null;
    } catch {
      return null;
    }
  }, [amount, assetDecimals]);

  const approve = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });
  const deposit = useWriteContract();
  const depositReceipt = useWaitForTransactionReceipt({ hash: deposit.data });
  const enroll = useWriteContract();
  const enrollReceipt = useWaitForTransactionReceipt({ hash: enroll.data });

  function handleDeposit() {
    if (!assetAddress || !parsed) return;
    approve.writeContract(
      { address: assetAddress, abi: ERC20_ABI, functionName: "approve", args: [pool, parsed] },
      { onSuccess: () => deposit.writeContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "deposit", args: [parsed] }) }
    );
  }

  return (
    <Panel
      title="Lend or back agents (deposit)"
      titleTip="Depositing alone makes you a passive lender, earning a share of every fee pool-wide. Backing one specific agent (vouching) is a separate, extra step below, and needs you to enroll as a 'root' first."
      hint="Deposited funds earn 60% of every fee as a lender, pro-rata by share. To back a specific agent too, enroll as a root (needs the pool's minRootStake already deposited) and use the vouch panel below."
    >
      <input className={inputClass} placeholder="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      <button className={buttonClass} disabled={!parsed || approve.isPending || approveReceipt.isLoading || deposit.isPending || depositReceipt.isLoading} onClick={handleDeposit}>
        {approve.isPending || approveReceipt.isLoading ? "Approving…" : deposit.isPending || depositReceipt.isLoading ? "Depositing…" : "Approve & deposit"}
      </button>
      {depositReceipt.isSuccess && <p className="text-xs text-[var(--green)]">Deposited.</p>}
      {(approve.error || deposit.error) && <p className="text-xs text-[var(--red)]">{(approve.error ?? deposit.error)?.message}</p>}

      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-[var(--muted)]">{isRoot ? "You are enrolled as a backer." : "Not enrolled as a backer yet."}</span>
        {!isRoot && (
          <button
            className="rounded border border-[var(--line)] px-3 py-1 text-xs"
            disabled={enroll.isPending || enrollReceipt.isLoading}
            onClick={() =>
              enroll.writeContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "enrollRoot" }, { onSuccess: () => refetchIsRoot() })
            }
          >
            {enroll.isPending || enrollReceipt.isLoading ? "Enrolling…" : "Enroll as backer"}
          </button>
        )}
      </div>
      {enroll.error && <p className="text-xs text-[var(--red)]">{enroll.error.message}</p>}
    </Panel>
  );
}

/** Step 2, sponsor side: paste the owner's signed consent and open the line. */
function VouchPanel({ agentId, pool, assetDecimals }: { agentId: bigint; pool: Address; assetDecimals: number }) {
  const [pasted, setPasted] = useState("");
  const [amount, setAmount] = useState("");
  const [premiumBps, setPremiumBps] = useState("0");

  const parsedConsent = useMemo(() => {
    try {
      const obj = JSON.parse(pasted);
      if (BigInt(obj.agentId) !== agentId) return { error: "this consent is for a different agent id" };
      return {
        sponsor: obj.sponsor as Address,
        maxPremiumBps: Number(obj.maxPremiumBps),
        nonce: BigInt(obj.nonce),
        deadline: BigInt(obj.deadline),
        signature: obj.signature as `0x${string}`,
      };
    } catch {
      return pasted ? { error: "couldn't parse that — paste the exact JSON from step 1" } : null;
    }
  }, [pasted, agentId]);

  const parsedAmount = useMemo(() => {
    try {
      return amount ? parseUnits(amount, assetDecimals) : null;
    } catch {
      return null;
    }
  }, [amount, assetDecimals]);

  const vouch = useWriteContract();
  const vouchReceipt = useWaitForTransactionReceipt({ hash: vouch.data });

  const consent = parsedConsent && !("error" in parsedConsent) ? parsedConsent : null;
  const premium = Number(premiumBps) || 0;
  const canSubmit = consent && parsedAmount && premium <= consent.maxPremiumBps;

  return (
    <Panel
      title="2 — Vouch for this agent (backer)"
      titleTip="This is the real commitment: it puts your own deposited funds behind this one agent specifically, so it can actually borrow against your stake. It's a real on-chain transaction, unlike step 1's free signature."
      hint="Paste the owner's signed consent from step 1, pick how much to vouch and your actual premium (must not exceed what they signed for)."
    >
      <textarea className={`${inputClass} font-mono text-xs`} rows={5} placeholder="paste the signed consent JSON here" value={pasted} onChange={(e) => setPasted(e.target.value)} />
      {parsedConsent && "error" in parsedConsent && <p className="text-xs text-[var(--red)]">{parsedConsent.error}</p>}
      <input className={inputClass} placeholder="amount to vouch" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      <input className={inputClass} placeholder={`your premium in bps — 100 bps = 1% (0–${consent?.maxPremiumBps ?? "…"})`} value={premiumBps} onChange={(e) => setPremiumBps(e.target.value)} />
      <button
        className={buttonClass}
        disabled={!canSubmit || vouch.isPending || vouchReceipt.isLoading}
        onClick={() => {
          if (!consent || !parsedAmount) return;
          vouch.writeContract({
            address: pool,
            abi: AGENT_CREDIT_POOL_ABI,
            functionName: "vouch",
            args: [agentId, parsedAmount, premium, consent.maxPremiumBps, consent.nonce, consent.deadline, consent.signature],
          });
        }}
      >
        {vouch.isPending || vouchReceipt.isLoading ? "Vouching…" : "Vouch"}
      </button>
      {vouchReceipt.isSuccess && <p className="text-xs text-[var(--green)]">Line opened.</p>}
      {vouch.error && <p className="text-xs text-[var(--red)]">{vouch.error.message}</p>}
    </Panel>
  );
}

/** Step 3, owner side: draw on the line a sponsor just opened. */
function BorrowPanel({ agentId, pool, assetDecimals }: { agentId: bigint; pool: Address; assetDecimals: number }) {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [termDays, setTermDays] = useState("7");

  const parsedAmount = useMemo(() => {
    try {
      return amount ? parseUnits(amount, assetDecimals) : null;
    } catch {
      return null;
    }
  }, [amount, assetDecimals]);

  const borrow = useWriteContract();
  const borrowReceipt = useWaitForTransactionReceipt({ hash: borrow.data });

  return (
    <Panel
      title="3 — Borrow (agent owner)"
      titleTip="A real on-chain transaction: sends real funds to your wallet right now, drawn from the line a sponsor vouched for in step 2. This is debt — it has to be repaid, with a fee, or the loan can be marked defaulted after its grace period."
      hint="Draws straight from the line a sponsor vouched in step 2, into your own wallet. Fails if it would exceed what's still free."
    >
      <input className={inputClass} placeholder="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      <input className={inputClass} placeholder="term, days (1–30)" value={termDays} onChange={(e) => setTermDays(e.target.value)} inputMode="numeric" />
      <button
        className={buttonClass}
        disabled={!parsedAmount || !address || borrow.isPending || borrowReceipt.isLoading}
        onClick={() => {
          if (!parsedAmount || !address) return;
          borrow.writeContract({
            address: pool,
            abi: AGENT_CREDIT_POOL_ABI,
            functionName: "borrow",
            args: [agentId, parsedAmount, BigInt(Number(termDays) || 0), address],
          });
        }}
      >
        {borrow.isPending || borrowReceipt.isLoading ? "Borrowing…" : "Borrow to my wallet"}
      </button>
      {borrowReceipt.isSuccess && <p className="text-xs text-[var(--green)]">Borrowed.</p>}
      {borrow.error && <p className="text-xs text-[var(--red)]">{borrow.error.message}</p>}
    </Panel>
  );
}

/** Repay (anyone) and markDefault (anyone, permissionless by design) by loan id. */
function RepayPanel({ pool }: { pool: Address }) {
  const [loanId, setLoanId] = useState("");
  const parsedLoanId = loanId ? BigInt(loanId || "0") : null;

  const { data: assetAddress } = useReadContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "asset" });
  const { data: loan } = useReadContract({
    address: pool,
    abi: AGENT_CREDIT_POOL_ABI,
    functionName: "loanInfo",
    args: parsedLoanId !== null ? [parsedLoanId] : undefined,
    query: { enabled: parsedLoanId !== null },
  });
  const totalDue = loan ? loan[1] + loan[2] : null; // principal + fee

  const approve = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });
  const repay = useWriteContract();
  const repayReceipt = useWaitForTransactionReceipt({ hash: repay.data });
  const markDefault = useWriteContract();
  const markDefaultReceipt = useWaitForTransactionReceipt({ hash: markDefault.data });

  return (
    <Panel
      title="Repay, or mark a defaulted loan (anyone)"
      titleTip="Repaying closes the loan and pays its fee — anyone may do this on the borrower's behalf, not just the agent owner. 'Mark defaulted' only works once the loan is overdue past its grace period, and lets the backer's stake (not the lenders') absorb the loss."
      hint="Repay is permissionless — anyone may repay on an agent's behalf. markDefault only succeeds once the loan is past its grace period."
    >
      <input className={inputClass} placeholder="loan id" value={loanId} onChange={(e) => setLoanId(e.target.value)} inputMode="numeric" />
      {loan && loan[5] === 1 && totalDue !== null && <p className="text-xs text-[var(--muted)]">Owes {totalDue.toString()} (raw units) — principal + fee.</p>}
      <div className="flex gap-2">
        <button
          className={buttonClass}
          disabled={!assetAddress || !loan || loan[5] !== 1 || totalDue === null || approve.isPending || approveReceipt.isLoading || repay.isPending || repayReceipt.isLoading}
          onClick={() => {
            if (!assetAddress || parsedLoanId === null || totalDue === null) return;
            approve.writeContract(
              { address: assetAddress, abi: ERC20_ABI, functionName: "approve", args: [pool, totalDue] },
              { onSuccess: () => repay.writeContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "repay", args: [parsedLoanId] }) }
            );
          }}
        >
          {approve.isPending || approveReceipt.isLoading ? "Approving…" : repay.isPending || repayReceipt.isLoading ? "Repaying…" : "Approve & repay"}
        </button>
        <button
          className="rounded border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-50"
          disabled={!loan || loan[5] !== 1 || markDefault.isPending || markDefaultReceipt.isLoading}
          onClick={() => {
            if (parsedLoanId === null) return;
            markDefault.writeContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "markDefault", args: [parsedLoanId] });
          }}
        >
          {markDefault.isPending || markDefaultReceipt.isLoading ? "Marking…" : "Mark default"}
        </button>
      </div>
      {repayReceipt.isSuccess && <p className="text-xs text-[var(--green)]">Repaid.</p>}
      {markDefaultReceipt.isSuccess && <p className="text-xs text-[var(--red)]">Marked defaulted.</p>}
      {(approve.error || repay.error || markDefault.error) && (
        <p className="text-xs text-[var(--red)]">{(approve.error ?? repay.error ?? markDefault.error)?.message}</p>
      )}
    </Panel>
  );
}
