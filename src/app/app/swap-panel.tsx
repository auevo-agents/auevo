"use client";

import { useEffect, useMemo, useState } from "react";
import {
  encodeFunctionData,
  formatUnits,
  isAddress,
  parseUnits,
  type Address,
} from "viem";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import type { PublicClient } from "viem";
import {
  FEE_TIERS,
  UNISWAP_QUOTER_V2,
  UNISWAP_SWAP_ROUTER_02,
  UNISWAP_V3_FACTORY,
  WETH9,
} from "@/lib/uniswap";
import { robinhoodChain } from "@/lib/chains";
import { shortenAddress } from "@/lib/format";

/**
 * The actual swap form — single-hop Uniswap V3 on Robinhood Chain.
 * Extracted out of the Trading page so the token detail page can embed a
 * real, working trade panel instead of only linking out to Trading: same
 * logic, one place, instead of a second copy of money-moving code that
 * could quietly drift from the first.
 *
 * Deliberately routed through Uniswap's own, already-deployed, already
 * audited SwapRouter02 — the pool itself holds the funds, not code we
 * wrote. Every step (approve, swap) is a transaction the connected
 * wallet signs itself; nothing here ever custodies a token.
 *
 * Native ETH: whenever WETH9 is one leg of the pair, the panel settles
 * in native ETH rather than requiring the user to hold wrapped WETH —
 * paying in is a single exactInputSingle call with `value` set (Uniswap's
 * own SwapRouter02 wraps ETH it receives internally when tokenIn is
 * WETH9), receiving out is a two-step multicall (swap into the router's
 * own balance, then unwrapWETH9 to send real ETH to the caller) — the
 * standard SwapRouter02 pattern for this, not something invented here.
 * WETH9's address was confirmed 2026-09-21 against two independent
 * official Uniswap sources (see lib/uniswap.ts) after being an open gap
 * for most of this project.
 *
 * Order type is Market only. A "Limit" tab is shown but disabled rather
 * than left out — the intent is real (Uniswap X is live on Robinhood
 * Chain with zero-gas limit orders via its filler network), it just
 * isn't wired up yet; showing a working-looking tab that silently does
 * nothing would be worse than showing none.
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

/**
 * exactInputSingle: github.com/Uniswap/v3-periphery ISwapRouter.
 * multicall / unwrapWETH9: confirmed against Uniswap's own
 * swap-router-contracts repo (IMulticall.sol, IPeripheryPaymentsExtended.sol)
 * 2026-09-21 — unwrapWETH9(amountMinimum) sends the unwrapped ETH to
 * msg.sender, which multicall's delegatecall pattern keeps as the
 * original caller (this app's user), not the router.
 */
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
  {
    type: "function",
    name: "multicall",
    stateMutability: "payable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
  {
    type: "function",
    name: "unwrapWETH9",
    stateMutability: "payable",
    inputs: [{ name: "amountMinimum", type: "uint256" }],
    outputs: [],
  },
] as const;

type Quote = {
  fee: number;
  amountOut: bigint;
} | null;

type GasTier = "low" | "med" | "high";

/** Left unswapped as a cushion for gas when a "MAX" native-ETH fill would otherwise zero out the balance — this chain's own basefee floor is tiny, so this is a deliberately generous cushion, not a tight estimate. */
const NATIVE_GAS_RESERVE = parseUnits("0.002", 18);

function isValidAddress(value: string): value is Address {
  return isAddress(value, { strict: false });
}

function isNative(address: Address | undefined): boolean {
  return address !== undefined && address.toLowerCase() === WETH9.toLowerCase();
}

/**
 * Real EIP-1559 priority: "med" leaves the wallet/RPC's own defaults
 * alone (identical behaviour to before this existed), "low"/"high" scale
 * a fresh fee estimate. Best-effort — a failed estimate just falls back
 * to defaults rather than blocking the transaction.
 */
async function gasOverridesFor(publicClient: PublicClient | undefined, tier: GasTier) {
  if (tier === "med" || !publicClient) return {};
  try {
    const est = await publicClient.estimateFeesPerGas();
    const multiplier = tier === "low" ? 80n : 150n;
    return {
      maxFeePerGas: (est.maxFeePerGas * multiplier) / 100n,
      maxPriorityFeePerGas: (est.maxPriorityFeePerGas * multiplier) / 100n,
    };
  } catch {
    return {};
  }
}

export interface SwapPanelProps {
  initialTokenIn?: string;
  initialTokenOut?: string;
  /** When set, the pair is fixed — used on the token detail page, where the pair is already known, with a Buy/Sell toggle instead of address inputs. */
  lockPair?: boolean;
}

export function SwapPanel({
  initialTokenIn = "",
  initialTokenOut = "",
  lockPair = false,
}: SwapPanelProps) {
  const { address: account, isConnected } = useAccount();
  const publicClient = usePublicClient();

  // Locked mode: initialTokenIn/Out are the "buy" orientation (spend
  // quote, receive base); "sell" just swaps which one is in/out.
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [manualTokenIn, setManualTokenIn] = useState(initialTokenIn);
  const [manualTokenOut, setManualTokenOut] = useState(initialTokenOut);
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState(100); // 1%
  const [gasTier, setGasTier] = useState<GasTier>("med");
  const [quote, setQuote] = useState<Quote>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // In locked mode, "buy" spends the quote token to receive the base
  // token; "sell" is the reverse. initialTokenIn/Out are always passed
  // in the "buy" orientation (quote, base) by the caller.
  const effectiveTokenIn = lockPair
    ? side === "buy"
      ? initialTokenIn
      : initialTokenOut
    : manualTokenIn;
  const effectiveTokenOut = lockPair
    ? side === "buy"
      ? initialTokenOut
      : initialTokenIn
    : manualTokenOut;

  const tokenIn = isValidAddress(effectiveTokenIn) ? effectiveTokenIn : undefined;
  const tokenOut = isValidAddress(effectiveTokenOut) ? effectiveTokenOut : undefined;
  const isNativeIn = isNative(tokenIn);
  const isNativeOut = isNative(tokenOut);

  const nativeBalance = useBalance({
    address: account,
    chainId: robinhoodChain.id,
    query: { enabled: isNativeIn && Boolean(account) },
  });

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
  const [inDecimals, inSymbol, outDecimals, outSymbol, erc20InBalance, allowance] =
    tokenMetaResults;

  // Display-only: the underlying pool/quote always trades WETH9, but a
  // panel paying or receiving in native ETH should say "ETH" and show
  // the wallet's real ETH balance, not WETH9's.
  const displayInSymbol = isNativeIn ? "ETH" : (inSymbol as string | undefined);
  const displayOutSymbol = isNativeOut ? "ETH" : (outSymbol as string | undefined);
  const inBalance = isNativeIn ? nativeBalance.data?.value : (erc20InBalance as bigint | undefined);

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

  const needsApproval = isNativeIn
    ? false
    : typeof allowance === "bigint" && parsedAmountIn !== null
      ? allowance < parsedAmountIn
      : null;

  const approve = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });
  const swap = useWriteContract();
  const swapReceipt = useWaitForTransactionReceipt({ hash: swap.data });

  async function handleApprove() {
    if (!tokenIn || !parsedAmountIn) return;
    const overrides = await gasOverridesFor(publicClient, gasTier);
    approve.writeContract({
      address: tokenIn,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [UNISWAP_SWAP_ROUTER_02, parsedAmountIn],
      ...overrides,
    });
  }

  async function handleSwap() {
    if (!tokenIn || !tokenOut || !account || !parsedAmountIn || !quote || amountOutMinimum === null) {
      return;
    }
    const overrides = await gasOverridesFor(publicClient, gasTier);

    if (isNativeOut) {
      // Two steps in one transaction: swap into the router's own
      // balance, then unwrap that WETH to real ETH sent to the caller.
      const swapCalldata = encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn,
            tokenOut,
            fee: quote.fee,
            recipient: UNISWAP_SWAP_ROUTER_02,
            amountIn: parsedAmountIn,
            amountOutMinimum,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
      const unwrapCalldata = encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: "unwrapWETH9",
        args: [amountOutMinimum],
      });
      swap.writeContract({
        address: UNISWAP_SWAP_ROUTER_02,
        abi: SWAP_ROUTER_ABI,
        functionName: "multicall",
        args: [[swapCalldata, unwrapCalldata]],
        ...overrides,
      });
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
      value: isNativeIn ? parsedAmountIn : undefined,
      ...overrides,
    });
  }

  function fillFraction(fraction: number) {
    if (typeof inBalance !== "bigint" || typeof inDecimals !== "number") return;
    let amount = (inBalance * BigInt(Math.round(fraction * 1000))) / 1000n;
    if (isNativeIn && fraction >= 1) {
      amount = inBalance > NATIVE_GAS_RESERVE ? inBalance - NATIVE_GAS_RESERVE : 0n;
    }
    setAmountIn(formatUnits(amount, inDecimals));
  }

  if (!isConnected) {
    return <div className="app-empty">Connect a wallet above to trade.</div>;
  }

  return (
    <div className="trade-form">
      {lockPair && (
        <div className="trade-side-toggle">
          <button
            className={side === "buy" ? "trade-side-btn buy active" : "trade-side-btn buy"}
            onClick={() => setSide("buy")}
          >
            Buy
          </button>
          <button
            className={side === "sell" ? "trade-side-btn sell active" : "trade-side-btn sell"}
            onClick={() => setSide("sell")}
          >
            Sell
          </button>
        </div>
      )}

      <div className="trade-order-tabs">
        <span className="trade-order-tab active">Market</span>
        <span className="trade-order-tab disabled" title="Uniswap X limit orders are live on Robinhood Chain — not wired up here yet">
          Limit · soon
        </span>
      </div>

      {lockPair ? (
        <div className="trade-locked-pair">
          <span>{displayInSymbol ?? (tokenIn ? shortenAddress(tokenIn) : "?")}</span>
          <span className="trade-locked-arrow">→</span>
          <span>{displayOutSymbol ?? (tokenOut ? shortenAddress(tokenOut) : "?")}</span>
          {typeof inBalance === "bigint" && typeof inDecimals === "number" && (
            <small>balance {Number(formatUnits(inBalance, inDecimals)).toFixed(4)}</small>
          )}
        </div>
      ) : (
        <>
          <label className="trade-field">
            <span>Token in (address)</span>
            <input
              value={manualTokenIn}
              onChange={(e) => setManualTokenIn(e.target.value.trim())}
              placeholder="0x…"
              spellCheck={false}
            />
            {typeof displayInSymbol === "string" && (
              <small>
                {displayInSymbol}
                {typeof inBalance === "bigint" && typeof inDecimals === "number"
                  ? ` · balance ${Number(formatUnits(inBalance, inDecimals)).toFixed(4)}`
                  : ""}
                {isNativeIn ? " (native)" : ""}
              </small>
            )}
          </label>

          <label className="trade-field">
            <span>Token out (address)</span>
            <input
              value={manualTokenOut}
              onChange={(e) => setManualTokenOut(e.target.value.trim())}
              placeholder="0x…"
              spellCheck={false}
            />
            {typeof displayOutSymbol === "string" && (
              <small>
                {displayOutSymbol}
                {isNativeOut ? " (native)" : ""}
              </small>
            )}
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

      {typeof inBalance === "bigint" && typeof inDecimals === "number" && (
        <div className="trade-pill-row">
          <button onClick={() => fillFraction(0.25)}>25%</button>
          <button onClick={() => fillFraction(0.5)}>50%</button>
          <button onClick={() => fillFraction(1)}>MAX</button>
        </div>
      )}

      <label className="trade-field">
        <span>Slippage tolerance</span>
        <div className="trade-pill-row">
          {[50, 100, 300, 500].map((bps) => (
            <button
              key={bps}
              className={slippageBps === bps ? "active" : undefined}
              onClick={() => setSlippageBps(bps)}
            >
              {(bps / 100).toFixed(1)}%
            </button>
          ))}
        </div>
      </label>

      <label className="trade-field">
        <span>Priority</span>
        <div className="trade-pill-row">
          {(["low", "med", "high"] as const).map((tier) => (
            <button
              key={tier}
              className={gasTier === tier ? "active" : undefined}
              onClick={() => setGasTier(tier)}
            >
              {tier === "med" ? "Med" : tier === "low" ? "Low" : "High"}
            </button>
          ))}
        </div>
      </label>

      <div className="trade-quote">
        {quoting && <span>Finding the best available pool…</span>}
        {quoteError && <span className="trade-quote-error">{quoteError}</span>}
        {quote && typeof outDecimals === "number" && (
          <>
            <span>
              ≈ {Number(formatUnits(quote.amountOut, outDecimals)).toFixed(6)}{" "}
              {displayOutSymbol ?? "tokens"}
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
          {approve.isPending || approveReceipt.isLoading ? "Approving…" : `Approve ${displayInSymbol ?? "token"}`}
        </button>
      ) : (
        <button
          className="app-connect-button"
          disabled={!quote || swap.isPending || swapReceipt.isLoading}
          onClick={handleSwap}
        >
          {swap.isPending || swapReceipt.isLoading
            ? "Swapping…"
            : lockPair
              ? `${side === "buy" ? "Buy" : "Sell"} ${(side === "buy" ? displayOutSymbol : displayInSymbol) ?? "token"}`
              : "Swap"}
        </button>
      )}

      {approve.error && <p className="error">{approve.error.message}</p>}
      {swap.error && <p className="error">{swap.error.message}</p>}
      {swapReceipt.isSuccess && <p className="trade-success">Swap confirmed on-chain.</p>}
    </div>
  );
}
