"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { ConnectButton } from "../connect-button";

/**
 * Single-hop ERC-20 <-> ERC-20 swap via Uniswap V3 on Robinhood Chain.
 *
 * Deliberately routed through Uniswap's own, already-deployed, already
 * audited SwapRouter02 rather than a contract of ours — the pool itself
 * holds the funds, under Uniswap's code, not code we wrote and are
 * asking people to trust on day one. Every step (approve, swap) is a
 * transaction the connected wallet signs itself; nothing here ever
 * custodies a token.
 *
 * No native-ETH leg yet: that needs a confirmed WETH9 address for this
 * chain, which research could not pin down with confidence (see
 * lib/uniswap.ts). Guessing it would mean guessing which contract a
 * "wrap" transaction sends ETH to — exactly the kind of guess that
 * shouldn't happen in code that moves money.
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

export default function TradingPage() {
  return (
    <Suspense fallback={null}>
      <TradingApp />
    </Suspense>
  );
}

function TradingApp() {
  const searchParams = useSearchParams();
  const { address: account, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const [tokenInAddr, setTokenInAddr] = useState(searchParams.get("tokenIn") ?? "");
  const [tokenOutAddr, setTokenOutAddr] = useState(searchParams.get("tokenOut") ?? "");
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

  return (
    <main className="app-shell">
      <TradingSidebar />

      <div className="product-main app-main">
        <header className="product-header">
          <div>
            <h3>Trading</h3>
            <p>Single-hop swap via Uniswap V3 · non-custodial</p>
          </div>
          <ConnectButton />
        </header>

        <div className="app-notice app-notice-info">
          Routed through Uniswap&apos;s own SwapRouter02 on Robinhood Chain —
          not a contract of ours. You approve and sign every step in your
          own wallet. ERC-20 pairs only for now; native-ETH swaps need a
          confirmed WETH address first.
        </div>

        {!isConnected ? (
          <div className="app-empty">Connect a wallet above to trade.</div>
        ) : (
          <div className="trade-form">
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
              <select
                value={slippageBps}
                onChange={(e) => setSlippageBps(Number(e.target.value))}
              >
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
                {approve.isPending || approveReceipt.isLoading
                  ? "Approving…"
                  : `Approve ${inSymbol ?? "token"}`}
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
            {swapReceipt.isSuccess && (
              <p className="trade-success">Swap confirmed on-chain.</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function TradingSidebar() {
  return (
    <aside className="product-sidebar">
      <div className="product-logo">
        <strong>auevo</strong>
        <i />
      </div>

      <nav className="product-nav">
        <Link href="/app" className="app-nav-link">
          <span className="nav-icon">
            <i />
            <i />
            <i />
            <i />
          </span>
          <b>Overview</b>
        </Link>
        <Link href="/app/market" className="app-nav-link">
          <span className="nav-icon nav-bots">
            <i />
          </span>
          <b>Market</b>
        </Link>
        <button className="active">
          <span className="nav-icon nav-trading">
            <i />
            <i />
            <i />
          </span>
          <b>Trading</b>
        </button>
        <Link href="/app/bots" className="app-nav-link">
          <span className="nav-icon nav-copy">
            <i />
            <i />
            <i />
          </span>
          <b>Bots</b>
        </Link>
        <Link href="/app/positions" className="app-nav-link">
          <span className="nav-icon nav-position">
            <i />
            <i />
          </span>
          <b>Positions</b>
        </Link>
        <Link href="/app/wallets" className="app-nav-link">
          <span className="nav-icon nav-wallet">
            <i />
          </span>
          <b>Wallets</b>
        </Link>
        <Link href="/scanner" className="app-nav-link">
          <span className="nav-icon nav-analytics">
            <i />
            <i />
            <i />
          </span>
          <b>Token Scanner</b>
        </Link>
      </nav>
    </aside>
  );
}
