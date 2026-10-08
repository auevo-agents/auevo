"use client";

import { useState } from "react";
import { maxUint160, maxUint256, parseUnits, formatUnits, type Address } from "viem";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { ERC20_ABI } from "@/lib/erc20-abi";
import { PERMIT2, USDG, USDG_DECIMALS, V4_POSITION_MANAGER } from "@/lib/rwa/dex/addresses";
import { CopyableAddress } from "@/app/copyable-address";

const PERMIT2_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    outputs: [],
  },
] as const;

const MAX_PERMIT2_EXPIRATION = 281474976710655; // uint48 max — "never expires" in practice, same posture as the ERC20-to-Permit2 max-allowance approve everywhere else in this app

/**
 * Full-range add-liquidity flow for one v4 RWA/USDG pool — RWA_SPEC.md
 * Phase 8's "Adding liquidity — later". No Permit2 batch-signature here
 * (see lib/rwa/dex/lp.ts's own note): both tokens go through the plain
 * on-chain Permit2 allowance path instead of a gasless signature, which
 * costs the user two extra approval transactions the first time but
 * needs no new typed-data-signing flow to get right. Every approve call
 * here is idempotent — re-clicking one that's already been granted just
 * confirms the same allowance again, harmlessly.
 */
export function AddLiquidityPanel({ poolId, ticker }: { poolId: string; ticker: string }) {
  const { address: account } = useAccount();
  const [amountUsdg, setAmountUsdg] = useState("");
  const [quote, setQuote] = useState<{
    to: Address;
    data: `0x${string}`;
    value: bigint;
    tokenAddress: Address;
    tokenDecimals: number;
    amountTokenRequired: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);

  const approveUsdgToPermit2 = useWriteContract();
  const approveTokenToPermit2 = useWriteContract();
  const approveUsdgPermit2ToPm = useWriteContract();
  const approveTokenPermit2ToPm = useWriteContract();
  const sendMintTx = useSendTransaction();
  const mintReceipt = useWaitForTransactionReceipt({ hash: sendMintTx.data });

  async function handlePreview() {
    setError(null);
    setQuote(null);
    if (!account) return;
    let parsed: bigint;
    try {
      parsed = parseUnits(amountUsdg, USDG_DECIMALS);
      if (parsed <= 0n) throw new Error("non-positive");
    } catch {
      setError("Enter a valid USDG amount");
      return;
    }
    setLoadingQuote(true);
    try {
      const res = await fetch(`/api/rwa/pools/${poolId}/build-add-liquidity`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountUsdgIn: parsed.toString(), recipient: account }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not price this position");
        return;
      }
      setQuote({
        to: data.to,
        data: data.data,
        value: BigInt(data.value),
        tokenAddress: data.token,
        tokenDecimals: data.tokenDecimals,
        amountTokenRequired: data.amountTokenRequired,
      });
    } catch {
      setError("Network error pricing this position");
    } finally {
      setLoadingQuote(false);
    }
  }

  function handleMint() {
    if (!quote) return;
    sendMintTx.sendTransaction({ to: quote.to, data: quote.data, value: quote.value });
  }

  return (
    <div className="dash-list-card" style={{ marginTop: 8, padding: 18 }}>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
        Full-range position on {ticker}/USDG. You&apos;ll need to approve both tokens to Permit2, then to Uniswap&apos;s
        Position Manager, before minting — four one-time transactions the first time you LP this pool.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          type="text"
          inputMode="decimal"
          placeholder="USDG amount"
          value={amountUsdg}
          onChange={(e) => setAmountUsdg(e.target.value)}
          style={{ flex: "1 1 160px", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "#f2f4f3" }}
        />
        <button className="desk-tab" onClick={handlePreview} disabled={loadingQuote || !account}>
          {loadingQuote ? "Pricing…" : "Preview"}
        </button>
      </div>

      {!account && <p className="error">Connect a wallet first.</p>}
      {error && <p className="error">{error}</p>}

      {quote && (
        <>
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
            This will also pull ≈{formatUnits(BigInt(quote.amountTokenRequired), quote.tokenDecimals)} {ticker}, full-range.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="desk-tab"
              onClick={() => approveUsdgToPermit2.writeContract({ address: USDG, abi: ERC20_ABI, functionName: "approve", args: [PERMIT2, maxUint256] })}
              disabled={approveUsdgToPermit2.isPending}
            >
              {approveUsdgToPermit2.isSuccess ? "✓ " : "1. "}Approve USDG → Permit2
            </button>
            <button
              className="desk-tab"
              onClick={() => approveTokenToPermit2.writeContract({ address: quote.tokenAddress, abi: ERC20_ABI, functionName: "approve", args: [PERMIT2, maxUint256] })}
              disabled={approveTokenToPermit2.isPending}
            >
              {approveTokenToPermit2.isSuccess ? "✓ " : "2. "}Approve {ticker} → Permit2
            </button>
            <button
              className="desk-tab"
              onClick={() =>
                approveUsdgPermit2ToPm.writeContract({
                  address: PERMIT2,
                  abi: PERMIT2_APPROVE_ABI,
                  functionName: "approve",
                  args: [USDG, V4_POSITION_MANAGER, maxUint160, MAX_PERMIT2_EXPIRATION],
                })
              }
              disabled={approveUsdgPermit2ToPm.isPending}
            >
              {approveUsdgPermit2ToPm.isSuccess ? "✓ " : "3. "}Approve USDG → Position Manager
            </button>
            <button
              className="desk-tab"
              onClick={() =>
                approveTokenPermit2ToPm.writeContract({
                  address: PERMIT2,
                  abi: PERMIT2_APPROVE_ABI,
                  functionName: "approve",
                  args: [quote.tokenAddress, V4_POSITION_MANAGER, maxUint160, MAX_PERMIT2_EXPIRATION],
                })
              }
              disabled={approveTokenPermit2ToPm.isPending}
            >
              {approveTokenPermit2ToPm.isSuccess ? "✓ " : "4. "}Approve {ticker} → Position Manager
            </button>
          </div>

          <button className="landing2-cta" style={{ marginTop: 14 }} onClick={handleMint} disabled={sendMintTx.isPending}>
            {sendMintTx.isPending ? "Minting…" : "Add liquidity"}
          </button>

          {sendMintTx.data && (
            <p className="desk-note">
              Tx: <CopyableAddress address={sendMintTx.data} />
            </p>
          )}
          {mintReceipt.isSuccess && <p style={{ color: "var(--green)" }}>Position minted.</p>}
          {sendMintTx.error && <p className="error">{sendMintTx.error.message}</p>}
        </>
      )}
    </div>
  );
}
