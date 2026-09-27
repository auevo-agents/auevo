"use client";

import { useEffect, useMemo, useState } from "react";
import {
  encodeFunctionData,
  formatUnits,
  isAddress,
  maxUint256,
  parseUnits,
  type Address,
} from "viem";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useSendTransaction,
  useSignTypedData,
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
import { PERMIT2, UNIVERSAL_ROUTER } from "@/lib/rwa/dex/addresses";
import { ERC20_ABI } from "@/lib/erc20-abi";
import { robinhoodChain } from "@/lib/chains";
import { shortenAddress } from "@/lib/format";
import {
  DEFAULT_QUICK_BUY_PRESETS,
  readQuickBuyPresets,
  writeQuickBuyPresets,
} from "@/lib/quick-buy-presets";
import { getWagmiConfig } from "@/lib/wagmi";
import { signTransaction } from "wagmi/actions";

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
 *
 * RWA_SPEC.md Phase 2 adds a second, better route this panel can take:
 * Uniswap v4 (single-hop, or a 2-hop through USDG mixing v3 and v4) via
 * UniversalRouter + Permit2, quoted and built server-side
 * (src/lib/rwa/dex/*, /api/dex/*) since the encoding needs the official
 * Uniswap SDKs rather than the hand-rolled ABI calls above — see
 * dex/build.ts for why. The v3 path above is untouched and still runs on
 * every keystroke; the v4/mixed quote is fetched in parallel and only
 * used when it quotes a strictly better output. Executing a v4/mixed
 * route needs its own approve+sign+send sequence (ERC-20 -> Permit2
 * approval once ever per token, an EIP-712 Permit2 signature roughly
 * once ever per token, then the swap itself) — see handleApproveToPermit2
 * / handleSignPermit / handleV4Swap below.
 */

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

/** IAllowanceTransfer.allowance (Permit2) — confirmed against Uniswap's own permit2 repo, src/interfaces/IAllowanceTransfer.sol. */
const PERMIT2_ALLOWANCE_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }, { type: "address" }],
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
  },
] as const;

type Quote = {
  fee: number;
  amountOut: bigint;
} | null;

interface V4RouteQuote {
  amountOut: bigint;
  legs: string[]; // protocol per leg, display-only ("v3" | "v4")
}

interface SignedPermit {
  details: { token: Address; amount: string; expiration: number; nonce: number };
  spender: Address;
  sigDeadline: number;
  signature: `0x${string}`;
}

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

  // RWA_SPEC.md Phase 2's v4/mixed route — quoted in parallel with v3
  // above, used only when it wins. See the doc comment at the top of this
  // file for the full approve/sign/send sequence this route needs.
  const [v4Route, setV4Route] = useState<V4RouteQuote | null>(null);
  const [v4Quoting, setV4Quoting] = useState(false);
  const [permit, setPermit] = useState<SignedPermit | null>(null);
  const [pendingPermit, setPendingPermit] = useState<{
    details: { token: Address; amount: string; expiration: number; nonce: number };
    spender: Address;
    sigDeadline: number;
  } | null>(null);
  const [permitFetchError, setPermitFetchError] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);

  // "Private swap" — HyperDex's MEV-protected submission, best-effort by
  // its own nature (see lib/rwa/private-swap.ts's doc comment: hidden
  // entirely unless a real private RPC is configured server-side, and
  // even then most injected wallets can't sign without also sending, so
  // this always falls back to a normal transaction rather than silently
  // doing nothing).
  const [privateSwapConfigured, setPrivateSwapConfigured] = useState(false);
  const [usePrivateSwap, setUsePrivateSwap] = useState(false);
  const [privateSwapPending, setPrivateSwapPending] = useState(false);
  const [privateSwapNotice, setPrivateSwapNotice] = useState<string | null>(null);
  const [privateSwapHash, setPrivateSwapHash] = useState<`0x${string}` | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/rwa/private-swap/status")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setPrivateSwapConfigured(Boolean(d.configured));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Lazy-initialized from localStorage — fine to differ from the SSR
  // markup for one paint, same reasoning as FavoriteStar.
  const [quickBuyPresets, setQuickBuyPresets] = useState<string[]>(() =>
    typeof window === "undefined" ? DEFAULT_QUICK_BUY_PRESETS : readQuickBuyPresets()
  );
  const [editingPresets, setEditingPresets] = useState(false);
  const [presetDraft, setPresetDraft] = useState<string[]>(quickBuyPresets);

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
      tokenIn &&
        account && {
          address: tokenIn,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [account, PERMIT2],
        },
    ].filter(Boolean) as never[],
    query: { enabled: Boolean(tokenIn && tokenOut) },
  });

  const tokenMetaResults = useMemo(
    () => tokenMeta.data?.map((r) => r.result) ?? [],
    [tokenMeta.data]
  );
  const [inDecimals, inSymbol, outDecimals, outSymbol, erc20InBalance, allowance, allowanceToPermit2] =
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

  // The v4/mixed route, quoted server-side (/api/dex/quote) in parallel
  // with the v3 probe above — see this file's top doc comment. Same
  // debounce, same "drop a stale slower response" guard.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setV4Route(null);

      if (!tokenIn || !tokenOut || !parsedAmountIn || parsedAmountIn <= 0n) return;
      if (tokenIn.toLowerCase() === tokenOut.toLowerCase()) return;

      setV4Quoting(true);
      try {
        const res = await fetch(
          `/api/dex/quote?tokenIn=${tokenIn}&tokenOut=${tokenOut}&amountIn=${parsedAmountIn.toString()}`
        );
        const data = await res.json();
        if (cancelled || !res.ok || !data.found) return;
        setV4Route({ amountOut: BigInt(data.amountOut), legs: data.legs.map((l: { protocol: string }) => l.protocol) });
      } catch {
        // A v4/mixed route is an optimization, not a requirement — the v3
        // probe above still runs independently, so a failure here just
        // means this panel falls back to whatever v3 already found.
      } finally {
        if (!cancelled) setV4Quoting(false);
      }
    }

    const timer = setTimeout(run, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tokenIn, tokenOut, parsedAmountIn]);

  // A permit signed for one token/amount stops being valid the moment
  // either changes (a new signature would be needed for a different
  // nonce/amount) — clearing it here rather than leaving a stale
  // signature around for the build step to reject at the last step.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setPermit(null);
    setPendingPermit(null);
    setPermitFetchError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [tokenIn, account]);

  // Best of the two engines: v3's own in-browser probe, or the v4/mixed
  // route from the server — never both, whichever quotes more output.
  const useV4Route = Boolean(v4Route && (!quote || v4Route.amountOut > quote.amountOut));

  const permit2Allowance = useReadContract({
    address: PERMIT2,
    abi: PERMIT2_ALLOWANCE_ABI,
    functionName: "allowance",
    args: tokenIn && account ? [account, tokenIn, UNIVERSAL_ROUTER] : undefined,
    query: { enabled: Boolean(useV4Route && tokenIn && account && !isNativeIn) },
  });

  // `Date.now()` can't be called during render (react-hooks/purity) — a
  // permit's expiry is instead checked inside an effect, once per fetch of
  // the allowance data, rather than freshly on every render.
  const [permitExpired, setPermitExpired] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPermitExpired(
      permit2Allowance.data ? permit2Allowance.data[1] < Math.floor(Date.now() / 1000) : false
    );
  }, [permit2Allowance.data]);

  const amountOutMinimum = useMemo(() => {
    if (!quote) return null;
    return (quote.amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
  }, [quote, slippageBps]);

  const v4AmountOutMinimum = useMemo(() => {
    if (!v4Route) return null;
    return (v4Route.amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
  }, [v4Route, slippageBps]);

  const needsApproval = isNativeIn
    ? false
    : typeof allowance === "bigint" && parsedAmountIn !== null
      ? allowance < parsedAmountIn
      : null;

  const needsPermit2Erc20Approval =
    useV4Route && !isNativeIn
      ? typeof allowanceToPermit2 === "bigint" && parsedAmountIn !== null
        ? allowanceToPermit2 < parsedAmountIn
        : null
      : false;

  const needsPermitSignature =
    useV4Route && !isNativeIn && !needsPermit2Erc20Approval
      ? permit
        ? false
        : permit2Allowance.data
          ? permit2Allowance.data[0] < (parsedAmountIn ?? 0n) || permitExpired
          : true
      : false;

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

  // --- v4/mixed route: ERC-20 -> Permit2 approval, Permit2 signature, swap ---

  const approveToPermit2 = useWriteContract();
  const approveToPermit2Receipt = useWaitForTransactionReceipt({ hash: approveToPermit2.data });
  const signPermit = useSignTypedData();
  const sendV4Tx = useSendTransaction();
  const sendV4TxReceipt = useWaitForTransactionReceipt({ hash: sendV4Tx.data });
  const [v4RecordId, setV4RecordId] = useState<number | null>(null);

  async function handleApproveToPermit2() {
    if (!tokenIn) return;
    const overrides = await gasOverridesFor(publicClient, gasTier);
    approveToPermit2.writeContract({
      address: tokenIn,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [PERMIT2, maxUint256],
      ...overrides,
    });
  }

  async function handleSignPermit() {
    if (!tokenIn || !account) return;
    setPermitFetchError(null);
    try {
      const res = await fetch(`/api/dex/permit-typed-data?owner=${account}&token=${tokenIn}`);
      const data = await res.json();
      if (!res.ok) {
        setPermitFetchError(data.error ?? "Could not prepare the Permit2 signature");
        return;
      }
      setPendingPermit({
        details: data.message.details,
        spender: data.message.spender,
        sigDeadline: data.message.sigDeadline,
      });
      signPermit.signTypedData({
        domain: data.domain,
        types: data.types,
        primaryType: data.primaryType,
        message: data.message,
      });
    } catch {
      setPermitFetchError("Network error preparing the Permit2 signature");
    }
  }

  // Pairs the just-returned signature with the request it was signed for
  // — signTypedData itself only ever hands back the raw signature bytes.
  useEffect(() => {
    if (signPermit.data && pendingPermit) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setPermit({ ...pendingPermit, signature: signPermit.data });
      setPendingPermit(null);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [signPermit.data, pendingPermit]);

  /**
   * Tries private submission first: sign-without-sending, then relay the
   * signed raw transaction to the server's configured private RPC. Never
   * assumes success — a wallet that doesn't support `eth_signTransaction`
   * (MetaMask's injected provider among them, which never implemented it)
   * throws here, and this returns false so the caller falls back to a
   * normal signed-and-sent transaction, with an honest on-screen reason
   * either way.
   */
  async function sendPrivately(tx: { to: Address; data: `0x${string}`; value: bigint }): Promise<boolean> {
    if (!account) return false;
    setPrivateSwapNotice(null);
    setPrivateSwapHash(null);
    setPrivateSwapPending(true);
    try {
      const config = getWagmiConfig();
      const signedTx = await signTransaction(config, {
        account,
        to: tx.to,
        data: tx.data,
        value: tx.value,
        chainId: robinhoodChain.id,
      });
      const res = await fetch("/api/rwa/private-swap/broadcast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signedTx }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Private broadcast failed");
      setPrivateSwapHash(data.hash);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setPrivateSwapNotice(
        /not supported|unsupported|method not found/i.test(message)
          ? "This wallet doesn't support signing without sending — sent as a normal transaction instead."
          : `Private submission failed${message ? ` (${message})` : ""} — sent as a normal transaction instead.`
      );
      return false;
    } finally {
      setPrivateSwapPending(false);
    }
  }

  async function handleV4Swap() {
    if (!tokenIn || !tokenOut || !account || !parsedAmountIn) return;
    if (typeof inDecimals !== "number" || typeof outDecimals !== "number") return;
    setBuildError(null);

    try {
      const res = await fetch("/api/dex/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tokenIn,
          tokenOut,
          decimalsIn: inDecimals,
          decimalsOut: outDecimals,
          symbolIn: inSymbol,
          symbolOut: outSymbol,
          amountIn: parsedAmountIn.toString(),
          nativeIn: isNativeIn,
          nativeOut: isNativeOut,
          slippageBps,
          recipient: account,
          permit: permit ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBuildError(data.error ?? "Could not build the swap");
        return;
      }

      // Best-effort — a failed record write should never block the trade
      // itself; app_transfers is Auevo's own log, not part of the swap.
      fetch("/api/dex/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account,
          recipient: account,
          srcToken: tokenIn,
          dstToken: tokenOut,
          amountIn: parsedAmountIn.toString(),
          route: data.route.join("+"),
          feeBps: 30,
        }),
      })
        .then((r) => r.json())
        .then((r) => {
          if (r.recorded && typeof r.id === "number") setV4RecordId(r.id);
        })
        .catch(() => {});

      const tx = { to: data.to as Address, data: data.data as `0x${string}`, value: BigInt(data.value) };

      if (usePrivateSwap && privateSwapConfigured) {
        const sentPrivately = await sendPrivately(tx);
        if (sentPrivately) return;
      }

      const overrides = await gasOverridesFor(publicClient, gasTier);
      sendV4Tx.sendTransaction({ ...tx, ...overrides });
    } catch {
      setBuildError("Network error building the swap");
    }
  }

  // Follows up the pending app_transfers row once the swap either confirms
  // or the wallet/chain reports a failure — see handleV4Swap for the
  // initial "pending" write this updates.
  useEffect(() => {
    if (!v4RecordId) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (sendV4TxReceipt.isSuccess) {
      fetch("/api/dex/record", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: v4RecordId, txHash: sendV4Tx.data, status: "done" }),
      }).catch(() => {});
      setV4RecordId(null);
    } else if (sendV4TxReceipt.isError || sendV4Tx.isError) {
      fetch("/api/dex/record", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: v4RecordId, txHash: sendV4Tx.data, status: "failed" }),
      }).catch(() => {});
      setV4RecordId(null);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [v4RecordId, sendV4TxReceipt.isSuccess, sendV4TxReceipt.isError, sendV4Tx.isError, sendV4Tx.data]);

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

      {lockPair && side === "buy" && (
        <div className="trade-quick-buy">
          {editingPresets ? (
            <>
              <div className="trade-pill-row trade-quick-buy-edit">
                {presetDraft.map((value, i) => (
                  <input
                    key={i}
                    value={value}
                    inputMode="decimal"
                    onChange={(e) => {
                      const next = [...presetDraft];
                      next[i] = e.target.value;
                      setPresetDraft(next);
                    }}
                  />
                ))}
              </div>
              <button
                className="trade-quick-buy-save"
                onClick={() => {
                  const cleaned = presetDraft.map((v, i) =>
                    v.trim() && !Number.isNaN(Number(v)) ? v.trim() : quickBuyPresets[i]
                  );
                  setQuickBuyPresets(cleaned);
                  writeQuickBuyPresets(cleaned);
                  setEditingPresets(false);
                }}
              >
                Save
              </button>
            </>
          ) : (
            <div className="trade-pill-row">
              {quickBuyPresets.map((value, i) => (
                <button key={i} onClick={() => setAmountIn(value)}>
                  {value} {displayInSymbol ?? ""}
                </button>
              ))}
              <button
                className="trade-quick-buy-edit-btn"
                title="Edit quick-buy amounts"
                onClick={() => {
                  setPresetDraft(quickBuyPresets);
                  setEditingPresets(true);
                }}
              >
                ✎
              </button>
            </div>
          )}
        </div>
      )}

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

      {useV4Route && privateSwapConfigured && (
        <label className="trade-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={usePrivateSwap} onChange={(e) => setUsePrivateSwap(e.target.checked)} />
          <span>Private swap (MEV-protected, best-effort — falls back to a normal transaction if your wallet can&apos;t sign without sending)</span>
        </label>
      )}

      <div className="trade-quote">
        {(quoting || v4Quoting) && <span>Finding the best available pool…</span>}
        {quoteError && !useV4Route && <span className="trade-quote-error">{quoteError}</span>}
        {useV4Route && v4Route && typeof outDecimals === "number" && (
          <>
            <span>
              ≈ {Number(formatUnits(v4Route.amountOut, outDecimals)).toFixed(6)}{" "}
              {displayOutSymbol ?? "tokens"}
            </span>
            <small>
              via {v4Route.legs.join(" + ")} · min received{" "}
              {v4AmountOutMinimum !== null
                ? Number(formatUnits(v4AmountOutMinimum, outDecimals)).toFixed(6)
                : "—"}
            </small>
          </>
        )}
        {!useV4Route && quote && typeof outDecimals === "number" && (
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

      {useV4Route ? (
        needsPermit2Erc20Approval ? (
          <button
            className="app-connect-button"
            disabled={approveToPermit2.isPending || approveToPermit2Receipt.isLoading}
            onClick={handleApproveToPermit2}
          >
            {approveToPermit2.isPending || approveToPermit2Receipt.isLoading
              ? "Approving…"
              : `Approve ${displayInSymbol ?? "token"} for Permit2`}
          </button>
        ) : needsPermitSignature ? (
          <button
            className="app-connect-button"
            disabled={signPermit.isPending}
            onClick={handleSignPermit}
          >
            {signPermit.isPending ? "Sign in wallet…" : `Sign to allow trading ${displayInSymbol ?? "this token"}`}
          </button>
        ) : (
          <button
            className="app-connect-button"
            disabled={!v4Route || sendV4Tx.isPending || sendV4TxReceipt.isLoading || privateSwapPending}
            onClick={handleV4Swap}
          >
            {privateSwapPending
              ? "Sending privately…"
              : sendV4Tx.isPending || sendV4TxReceipt.isLoading
              ? "Swapping…"
              : lockPair
                ? `${side === "buy" ? "Buy" : "Sell"} ${(side === "buy" ? displayOutSymbol : displayInSymbol) ?? "token"}`
                : "Swap"}
          </button>
        )
      ) : needsApproval ? (
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

      {useV4Route ? (
        <>
          {permitFetchError && <p className="error">{permitFetchError}</p>}
          {approveToPermit2.error && <p className="error">{approveToPermit2.error.message}</p>}
          {signPermit.error && <p className="error">{signPermit.error.message}</p>}
          {buildError && <p className="error">{buildError}</p>}
          {sendV4Tx.error && <p className="error">{sendV4Tx.error.message}</p>}
          {sendV4TxReceipt.isSuccess && <p className="trade-success">Swap confirmed on-chain.</p>}
          {privateSwapNotice && <p className="desk-note">{privateSwapNotice}</p>}
          {privateSwapHash && <p className="trade-success">Sent privately — {privateSwapHash}</p>}
        </>
      ) : (
        <>
          {approve.error && <p className="error">{approve.error.message}</p>}
          {swap.error && <p className="error">{swap.error.message}</p>}
          {swapReceipt.isSuccess && <p className="trade-success">Swap confirmed on-chain.</p>}
        </>
      )}
    </div>
  );
}
