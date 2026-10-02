"use client";

import { useMemo, useState } from "react";
import { formatUnits, isAddress, maxUint256, parseUnits, type Address } from "viem";
import {
  useAccount,
  useReadContracts,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { ERC20_ABI } from "@/lib/erc20-abi";
import { UNISWAP_NFT_POSITION_MANAGER, FEE_TIERS } from "@/lib/uniswap";
import { CopyableAddress } from "@/app/copyable-address";
import { TokenPickerButton, usePickableTokens } from "@/app/token-picker";

interface Quote {
  to: Address;
  data: `0x${string}`;
  value: bigint;
  poolAddress: Address;
  amountARequired: string;
  amountBRequired: string;
}

function isValidAddress(value: string): value is Address {
  return isAddress(value, { strict: false });
}

/**
 * Full-range add-liquidity flow for a GENERIC Uniswap v3 pool on
 * Robinhood Chain — the DEX page's "LP" tab said "Not wired up yet"; this
 * is that. Same v1 scope cut as the RWA/USDG v4 flow on /app/pools
 * (full-range only), same trust model as Swap (SwapRouter02) and the v4
 * flow (V4PositionManager): every step is a transaction the connected
 * wallet signs itself against Uniswap's own, already-audited
 * NonfungiblePositionManager — nothing here ever custodies a token.
 *
 * Unlike the v4/RWA flow, v3's NonfungiblePositionManager takes tokens
 * via a plain `transferFrom`, so this only needs one approval per token
 * (straight to the position manager), not the Permit2 two-step.
 */
export function LpPanel() {
  const { address: account, isConnected } = useAccount();
  const pickableTokens = usePickableTokens();

  const [tokenAInput, setTokenAInput] = useState("");
  const [tokenBInput, setTokenBInput] = useState("");
  const [fee, setFee] = useState<number>(3000);
  const [amountA, setAmountA] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);

  const tokenA = isValidAddress(tokenAInput) ? tokenAInput : undefined;
  const tokenB = isValidAddress(tokenBInput) ? tokenBInput : undefined;

  const tokenMeta = useReadContracts({
    allowFailure: true,
    contracts: [
      tokenA && { address: tokenA, abi: ERC20_ABI, functionName: "decimals" },
      tokenA && { address: tokenA, abi: ERC20_ABI, functionName: "symbol" },
      tokenB && { address: tokenB, abi: ERC20_ABI, functionName: "decimals" },
      tokenB && { address: tokenB, abi: ERC20_ABI, functionName: "symbol" },
      tokenA &&
        account && {
          address: tokenA,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [account, UNISWAP_NFT_POSITION_MANAGER],
        },
    ].filter(Boolean) as never[],
    query: { enabled: Boolean(tokenA && tokenB) },
  });

  const [decimalsA, symbolA, decimalsB, symbolB, allowanceA] = useMemo(
    () => tokenMeta.data?.map((r) => r.result) ?? [],
    [tokenMeta.data]
  );

  const allowanceB = useReadContracts({
    allowFailure: true,
    contracts: [
      tokenB &&
        account && {
          address: tokenB,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [account, UNISWAP_NFT_POSITION_MANAGER],
        },
    ].filter(Boolean) as never[],
    query: { enabled: Boolean(tokenB && account) },
  }).data?.[0]?.result as bigint | undefined;

  const approveA = useWriteContract();
  const approveAReceipt = useWaitForTransactionReceipt({ hash: approveA.data });
  const approveB = useWriteContract();
  const approveBReceipt = useWaitForTransactionReceipt({ hash: approveB.data });
  const sendMintTx = useSendTransaction();
  const mintReceipt = useWaitForTransactionReceipt({ hash: sendMintTx.data });

  async function handlePreview() {
    setQuoteError(null);
    setQuote(null);
    if (!account || !tokenA || !tokenB) return;
    if (typeof decimalsA !== "number" || typeof decimalsB !== "number") {
      setQuoteError("Could not read token decimals — check both addresses");
      return;
    }
    let parsed: bigint;
    try {
      parsed = parseUnits(amountA, decimalsA);
      if (parsed <= 0n) throw new Error("non-positive");
    } catch {
      setQuoteError("Enter a valid amount");
      return;
    }
    setLoadingQuote(true);
    try {
      const res = await fetch("/api/dex/build-add-liquidity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tokenA,
          tokenB,
          decimalsA,
          decimalsB,
          symbolA,
          symbolB,
          fee,
          amountAIn: parsed.toString(),
          recipient: account,
          slippageBps,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQuoteError(data.error ?? "Could not price this position");
        return;
      }
      setQuote({
        to: data.to,
        data: data.data,
        value: BigInt(data.value),
        poolAddress: data.poolAddress,
        amountARequired: data.amountARequired,
        amountBRequired: data.amountBRequired,
      });
    } catch {
      setQuoteError("Network error pricing this position");
    } finally {
      setLoadingQuote(false);
    }
  }

  function handleMint() {
    if (!quote) return;
    sendMintTx.sendTransaction({ to: quote.to, data: quote.data, value: quote.value });
  }

  const needsApproveA =
    quote && typeof allowanceA === "bigint" ? allowanceA < BigInt(quote.amountARequired) : Boolean(quote);
  const needsApproveB =
    quote && typeof allowanceB === "bigint" ? allowanceB < BigInt(quote.amountBRequired) : Boolean(quote);

  if (!isConnected) {
    return <div className="app-empty">Connect a wallet above to add liquidity.</div>;
  }

  return (
    <div className="trade-panel trade-panel-wide">
      <div className="trade-form">
        <div className="app-notice app-notice-info">
          Routed through Uniswap&apos;s own NonfungiblePositionManager on Robinhood Chain — not a
          contract of ours. Full-range only for now; every step is a transaction you sign yourself.
        </div>

        <label className="trade-field">
          <span>Token A</span>
          <div className="trade-field-picker-row">
            <TokenPickerButton
              value={tokenAInput}
              onChange={(address) => {
                setTokenAInput(address);
                setQuote(null);
              }}
              tokens={pickableTokens}
            />
            {typeof symbolA === "string" && <small>{symbolA}</small>}
          </div>
        </label>

        <label className="trade-field">
          <span>Token B</span>
          <div className="trade-field-picker-row">
            <TokenPickerButton
              value={tokenBInput}
              onChange={(address) => {
                setTokenBInput(address);
                setQuote(null);
              }}
              tokens={pickableTokens}
            />
            {typeof symbolB === "string" && <small>{symbolB}</small>}
          </div>
        </label>

        <label className="trade-field">
          <span>Fee tier</span>
          <div className="trade-pill-row">
            {FEE_TIERS.map((tier) => (
              <button
                key={tier}
                className={fee === tier ? "active" : undefined}
                onClick={() => {
                  setFee(tier);
                  setQuote(null);
                }}
              >
                {(tier / 10_000).toFixed(2)}%
              </button>
            ))}
          </div>
        </label>

        <label className="trade-field">
          <span>Amount of Token A to deposit</span>
          <input
            value={amountA}
            onChange={(e) => {
              setAmountA(e.target.value);
              setQuote(null);
            }}
            placeholder="0.0"
            inputMode="decimal"
          />
        </label>

        <label className="trade-field">
          <span>Slippage tolerance</span>
          <div className="trade-pill-row">
            {[50, 100, 300, 500].map((bps) => (
              <button
                key={bps}
                className={slippageBps === bps ? "active" : undefined}
                onClick={() => {
                  setSlippageBps(bps);
                  setQuote(null);
                }}
              >
                {(bps / 100).toFixed(1)}%
              </button>
            ))}
          </div>
        </label>

        <button className="app-connect-button" onClick={handlePreview} disabled={loadingQuote || !account}>
          {loadingQuote ? "Pricing…" : "Preview"}
        </button>

        {quoteError && <p className="error">{quoteError}</p>}

        {quote && typeof decimalsA === "number" && typeof decimalsB === "number" && (
          <>
            <div className="trade-quote">
              <span>
                Pool <CopyableAddress address={quote.poolAddress} /> · needs ≈
                {Number(formatUnits(BigInt(quote.amountARequired), decimalsA)).toFixed(6)} {symbolA ?? "A"} and ≈
                {Number(formatUnits(BigInt(quote.amountBRequired), decimalsB)).toFixed(6)} {symbolB ?? "B"}
              </span>
            </div>

            <h4>Approve, then mint</h4>

            {needsApproveA && (
              <button
                className="app-connect-button"
                disabled={approveA.isPending || approveAReceipt.isLoading}
                onClick={() =>
                  approveA.writeContract({
                    address: tokenA as Address,
                    abi: ERC20_ABI,
                    functionName: "approve",
                    args: [UNISWAP_NFT_POSITION_MANAGER, maxUint256],
                  })
                }
              >
                {approveA.isPending || approveAReceipt.isLoading ? "Approving…" : `Approve ${symbolA ?? "Token A"}`}
              </button>
            )}

            {!needsApproveA && needsApproveB && (
              <button
                className="app-connect-button"
                disabled={approveB.isPending || approveBReceipt.isLoading}
                onClick={() =>
                  approveB.writeContract({
                    address: tokenB as Address,
                    abi: ERC20_ABI,
                    functionName: "approve",
                    args: [UNISWAP_NFT_POSITION_MANAGER, maxUint256],
                  })
                }
              >
                {approveB.isPending || approveBReceipt.isLoading ? "Approving…" : `Approve ${symbolB ?? "Token B"}`}
              </button>
            )}

            {!needsApproveA && !needsApproveB && (
              <button className="app-connect-button" disabled={sendMintTx.isPending} onClick={handleMint}>
                {sendMintTx.isPending ? "Minting…" : "Add liquidity"}
              </button>
            )}

            {approveA.error && <p className="error">{approveA.error.message}</p>}
            {approveB.error && <p className="error">{approveB.error.message}</p>}
            {sendMintTx.error && <p className="error">{sendMintTx.error.message}</p>}
            {sendMintTx.data && (
              <p className="desk-note">
                Tx: <CopyableAddress address={sendMintTx.data} />
              </p>
            )}
            {mintReceipt.isSuccess && <p className="trade-success">Position minted.</p>}
          </>
        )}
      </div>
    </div>
  );
}
