"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, isAddress, parseUnits, type Address } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  FEE_TIERS,
  UNISWAP_QUOTER_V2,
  UNISWAP_SWAP_ROUTER_02,
  UNISWAP_V3_FACTORY,
} from "@/lib/uniswap";
import { shortenAddress } from "@/lib/format";

/**
 * The actual swap form — single-hop ERC-20 <-> ERC-20 via Uniswap V3 on
 * Robinhood Chain. Extracted out of the Trading page so the token detail
 * page can embed a real, working trade panel instead of only linking out
 * to Trading: same logic, one place, instead of a second copy of
 * money-moving code that could quietly drift from the first.
 *
 * Deliberately routed through Uniswap's own, already-deployed, already
 * audited SwapRouter02 — the pool itself holds the funds, not code we
 * wrote. Every step (approve, swap) is a transaction the connected
 * wallet signs itself; nothing here ever custodies a token.
 */

const ERC20_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;

const FACTORY_ABI = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }],
    outputs: [{ type: "address" }],
  },
] as const;

const QUOTER_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

const SWAP_ROUTER_ABI = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

type Quote = {
  fee: number;
  amountOut: bigint;
} | null;

function isValidAddress(value: string): value is Address {
  return isAddress(value, { strict: false });
}

export interface SwapPanelProps {
  initialTokenIn?: string;
  initialTokenOut?: string;
  /** When set, the pair is fixed (no address inputs) — used on the token detail page, where the pair is already known. */
  lockPair?: boolean;
}

export function SwapPanel({
  initialTokenIn = "",
  initialTokenOut = "",
  lockPair = false,
}: SwapPanelProps) {
  const { address: account, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const [tokenInAddr, setTokenInAddr] = useState(initialTokenIn);
  const [tokenOutAddr, setTokenOutAddr] = useState(initialTokenOut);
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState(100); // 1%
  const [quote, setQuote] = useState<Quote>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const tokenIn = isValidAddress(tokenInAddr) ? tokenInAddr : undefined;
  const tokenOut = isValidAddress(tokenOutAddr) ? tokenOutAddr : undefined;

  const tokenMeta = useReadContracts({
    allowFailure: true,
    contracts: [
      tokenIn && { address: tokenIn, abi: ERC20_ABI, functionName: "decimals" },
      tokenIn && { address: tokenIn, abi: ERC20_ABI, functionName: "symbol" },
      tokenOut && { address: tokenOut, abi: ERC20_ABI, functionName: "decimals" },
      tokenOut && { address: tokenOut, abi: ERC20_ABI, functionName: "symbol" },
      tokenIn &&
        account && {
          address: tokenIn,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [account],
        },
      tokenIn &&
        account && {
          address: tokenIn,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [account, UNISWAP_SWAP_ROUTER_02],
        },
    ].filter(Boolean) as never[],
    query: { enabled: Boolean(tokenIn && tokenOut) },
  });

  const tokenMetaResults = useMemo(
    () => tokenMeta.data?.map((r) => r.result) ?? [],
    [tokenMeta.data]
  );
  const [inDecimals, inSymbol, outDecimals, outSymbol, inBalance, allowance] =
    tokenMetaResults;

  const parsedAmountIn = useMemo(() => {
    if (!amountIn || typeof inDecimals !== "number") return null;
    try {
      return parseUnits(amountIn, inDecimals);
    } catch {
      return null;
    }
  }, [amountIn, inDecimals]);

  // Probes each standard fee tier for a live pool, then quotes against it.
  // Re-runs whenever the pair or amount changes; a stale response from a
  // slower earlier run is dropped rather than overwriting a fresher one.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setQuote(null);
      setQuoteError(null);

      if (!publicClient || !tokenIn || !tokenOut || !parsedAmountIn || parsedAmountIn <= 0n) {
        return;
      }
      if (tokenIn.toLowerCase() === tokenOut.toLowerCase()) {
        setQuoteError("Choose two different tokens");
        return;
      }

      setQuoting(true);
      try {
        for (const fee of FEE_TIERS) {
          const pool = await publicClient.readContract({
            address: UNISWAP_V3_FACTORY,
            abi: FACTORY_ABI,
            functionName: "getPool",
            args: [tokenIn, tokenOut, fee],
          });
          if (pool === "0x0000000000000000000000000000000000000000") continue;

          try {
            const result = await publicClient.readContract({
              address: UNISWAP_QUOTER_V2,
              abi: QUOTER_ABI,
              functionName: "quoteExactInputSingle",
              args: [
                {
                  tokenIn,
                  tokenOut,
                  amountIn: parsedAmountIn,
                  fee,
                  sqrtPriceLimitX96: 0n,
                },
              ],
            });
            if (!cancelled) {
              setQuote({ fee, amountOut: result[0] });
              setQuoting(false);
            }
            return;
          } catch {
            // This tier has a pool but not enough liquidity to quote —
            // try the next tier instead of failing the whole lookup.
            continue;
          }
        }
        if (!cancelled) {
          setQuoteError("No live pool found for this pair on any standard fee tier");
        }
      } catch {
        if (!cancelled) setQuoteError("Could not reach the chain to quote this pair");
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }

    const timer = setTimeout(run, 400); // debounce typing
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [publicClient, tokenIn, tokenOut, parsedAmountIn]);

  const amountOutMinimum = useMemo(() => {
    if (!quote) return null;
    return (quote.amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
  }, [quote, slippageBps]);

  const needsApproval =
    typeof allowance === "bigint" && parsedAmountIn !== null
      ? allowance < parsedAmountIn
      : null;

  const approve = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });
  const swap = useWriteContract();
  const swapReceipt = useWaitForTransactionReceipt({ hash: swap.data });

  function handleApprove() {
    if (!tokenIn || !parsedAmountIn) return;
    approve.writeContract({
      address: tokenIn,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [UNISWAP_SWAP_ROUTER_02, parsedAmountIn],
    });
  }

  function handleSwap() {
    if (!tokenIn || !tokenOut || !account || !parsedAmountIn || !quote || amountOutMinimum === null) {
      return;
    }
    swap.writeContract({
      address: UNISWAP_SWAP_ROUTER_02,
      abi: SWAP_ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn,
          tokenOut,
          fee: quote.fee,
          recipient: account,
          amountIn: parsedAmountIn,
          amountOutMinimum,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
  }

  if (!isConnected) {
    return <div className="app-empty">Connect a wallet above to trade.</div>;
  }

  return (
    <div className="trade-form">
      {lockPair ? (
        <div className="trade-locked-pair">
          <span>{inSymbol ?? (tokenIn ? shortenAddress(tokenIn) : "?")}</span>
          <span className="trade-locked-arrow">→</span>
          <span>{outSymbol ?? (tokenOut ? shortenAddress(tokenOut) : "?")}</span>
          {typeof inBalance === "bigint" && typeof inDecimals === "number" && (
            <small>
              balance {Number(formatUnits(inBalance, inDecimals)).toFixed(4)}
            </small>
          )}
        </div>
      ) : (
        <>
          <label className="trade-field">
            <span>Token in (address)</span>
            <input
              value={tokenInAddr}
              onChange={(e) => setTokenInAddr(e.target.value.trim())}
              placeholder="0x…"
              spellCheck={false}
            />
            {typeof inSymbol === "string" && (
              <small>
                {inSymbol}
                {typeof inBalance === "bigint" && typeof inDecimals === "number"
                  ? ` · balance ${Number(formatUnits(inBalance, inDecimals)).toFixed(4)}`
                  : ""}
              </small>
            )}
          </label>

          <label className="trade-field">
            <span>Token out (address)</span>
            <input
              value={tokenOutAddr}
              onChange={(e) => setTokenOutAddr(e.target.value.trim())}
              placeholder="0x…"
              spellCheck={false}
            />
            {typeof outSymbol === "string" && <small>{outSymbol}</small>}
          </label>
        </>
      )}

      <label className="trade-field">
        <span>Amount in</span>
        <input
          value={amountIn}
          onChange={(e) => setAmountIn(e.target.value)}
          placeholder="0.0"
          inputMode="decimal"
        />
      </label>

      <label className="trade-field">
        <span>Slippage tolerance</span>
        <select value={slippageBps} onChange={(e) => setSlippageBps(Number(e.target.value))}>
          <option value={50}>0.5%</option>
          <option value={100}>1%</option>
          <option value={300}>3%</option>
        </select>
      </label>

      <div className="trade-quote">
        {quoting && <span>Finding the best available pool…</span>}
        {quoteError && <span className="trade-quote-error">{quoteError}</span>}
        {quote && typeof outDecimals === "number" && (
          <>
            <span>
              ≈ {Number(formatUnits(quote.amountOut, outDecimals)).toFixed(6)}{" "}
              {outSymbol ?? "tokens"}
            </span>
            <small>
              {(quote.fee / 10_000).toFixed(2)}% pool · min received{" "}
              {amountOutMinimum !== null
                ? Number(formatUnits(amountOutMinimum, outDecimals)).toFixed(6)
                : "—"}
            </small>
          </>
        )}
      </div>

      {needsApproval ? (
        <button
          className="app-connect-button"
          disabled={approve.isPending || approveReceipt.isLoading}
          onClick={handleApprove}
        >
          {approve.isPending || approveReceipt.isLoading ? "Approving…" : `Approve ${inSymbol ?? "token"}`}
        </button>
      ) : (
        <button
          className="app-connect-button"
          disabled={!quote || swap.isPending || swapReceipt.isLoading}
          onClick={handleSwap}
        >
          {swap.isPending || swapReceipt.isLoading ? "Swapping…" : "Swap"}
        </button>
      )}

      {approve.error && <p className="error">{approve.error.message}</p>}
      {swap.error && <p className="error">{swap.error.message}</p>}
      {swapReceipt.isSuccess && <p className="trade-success">Swap confirmed on-chain.</p>}
    </div>
  );
}
