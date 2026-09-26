import type { Address, PublicClient } from "viem";
import { Percent, Token, Ether, CurrencyAmount, TradeType, type Currency } from "@uniswap/sdk-core";
import { Pool as V3Pool, Route as V3Route } from "@uniswap/v3-sdk";
import { Pool as V4Pool, Route as V4Route } from "@uniswap/v4-sdk";
import { Trade as RouterTrade } from "@uniswap/router-sdk";
import { SwapRouter, type Permit2Permit } from "@uniswap/universal-router-sdk";
import { PERMIT2, USDG, WETH9, ZERO_ADDRESS, UNIVERSAL_ROUTER, STATE_VIEW } from "./addresses";
import { poolId } from "./pool-key";
import type { LegQuote, RouteQuote } from "./quote";
import { robinhoodChain } from "@/lib/chains";

/**
 * Turns a quoted route (quote.ts) into the exact calldata to send to
 * UniversalRouter — the part of Phase 2 that most needed the official
 * `@uniswap/v4-sdk` / `@uniswap/router-sdk` / `@uniswap/universal-router-sdk`
 * SDKs rather than hand-rolled ABI encoding (see the note in
 * src/app/api/dex/build/route.ts on why: v4's Actions byte-format is much
 * easier to get subtly wrong than v3's flat `exactInputSingle` call).
 *
 * Deliberately re-fetches each pool's live on-chain state (sqrtPriceX96,
 * liquidity, tick) here rather than trusting quote.ts's numbers, which may
 * be a user-typing-debounce's worth of seconds stale by the time they hit
 * "Buy" — the *amounts* still come from the route that was quoted (we are
 * not re-simulating the trade), but the *pool objects* passed to the SDK
 * are current, so a v3/v4 tick-consistency check inside the SDK can't fail
 * on stale data that has nothing to do with this trade's own slippage
 * tolerance.
 */

const V3_POOL_STATE_ABI = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "liquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint128" }],
  },
] as const;

const STATE_VIEW_ABI = [
  {
    type: "function",
    name: "getSlot0",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
  },
  {
    type: "function",
    name: "getLiquidity",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [{ name: "liquidity", type: "uint128" }],
  },
] as const;

export interface TokenMeta {
  address: Address;
  decimals: number;
  symbol?: string;
}

/**
 * `native` is this trade's *outer* intent (the user pays/receives real
 * ETH), independent of which currency a given leg's pool actually holds
 * (WETH9 or true native address(0) — see quote.ts's v4CandidatesFor). The
 * SDK reconciles the two itself: if the first leg needs WETH9 but the
 * trade's declared input is `Ether.onChain`, `UniswapTrade` inserts a
 * WRAP_ETH command; same for UNWRAP_WETH on the output side.
 */
function currencyFor(token: TokenMeta, native: boolean): Currency {
  if (native) return Ether.onChain(robinhoodChain.id);
  return new Token(robinhoodChain.id, token.address, token.decimals, token.symbol);
}

async function hydrateV3Pool(
  client: PublicClient,
  leg: Extract<LegQuote, { protocol: "v3" }>,
  currencyIn: Currency,
  currencyOut: Currency
): Promise<V3Pool> {
  const [slot0, liquidity] = await Promise.all([
    client.readContract({ address: leg.poolAddress, abi: V3_POOL_STATE_ABI, functionName: "slot0" }),
    client.readContract({ address: leg.poolAddress, abi: V3_POOL_STATE_ABI, functionName: "liquidity" }),
  ]);

  const [token0, token1] =
    currencyIn.wrapped.address.toLowerCase() < currencyOut.wrapped.address.toLowerCase()
      ? [currencyIn.wrapped, currencyOut.wrapped]
      : [currencyOut.wrapped, currencyIn.wrapped];

  return new V3Pool(token0, token1, leg.fee, slot0[0].toString(), liquidity.toString(), slot0[1]);
}

async function hydrateV4Pool(
  client: PublicClient,
  leg: Extract<LegQuote, { protocol: "v4" }>,
  currencyIn: Currency,
  currencyOut: Currency
): Promise<V4Pool> {
  const id = poolId(leg.poolKey);
  const [slot0, liquidity] = await Promise.all([
    client.readContract({ address: STATE_VIEW, abi: STATE_VIEW_ABI, functionName: "getSlot0", args: [id] }),
    client.readContract({ address: STATE_VIEW, abi: STATE_VIEW_ABI, functionName: "getLiquidity", args: [id] }),
  ]);

  return new V4Pool(
    currencyIn,
    currencyOut,
    leg.poolKey.fee,
    leg.poolKey.tickSpacing,
    leg.poolKey.hooks,
    slot0[0].toString(),
    liquidity.toString(),
    slot0[1]
  );
}

export interface BuildSwapParams {
  client: PublicClient;
  route: RouteQuote;
  tokenIn: TokenMeta;
  tokenOut: TokenMeta;
  amountIn: bigint;
  nativeIn: boolean;
  nativeOut: boolean;
  slippageBps: number;
  recipient: Address;
  deadline: number; // unix seconds
  feeBps: number;
  feeRecipient: Address;
  /** Omit when the input leg is funded natively, or when the payer already has a live Permit2 allowance covering this amount (see the /api/dex/build route for how that's decided). */
  permit?: Permit2Permit;
}

export interface BuiltSwap {
  to: Address;
  data: `0x${string}`;
  value: bigint;
}

/**
 * The platform fee is taken from the swap's OUTPUT via `PAY_PORTION` — the
 * exact router command RWA_SPEC.md phase 2 names ("отдельной командой
 * роутера (PAY_PORTION/transfer)") — not from the input as that same
 * sentence's own wording ("с входного токена") suggested. Verified against
 * universal-router-sdk's actual source (entities/actions/uniswap.ts): its
 * `flatFee` option (an input-side-shaped fixed TRANSFER) is validated
 * against `minimumAmountOut`, i.e. it is *also* an output-side deduction —
 * there is no input-side fee path in the SDK at all. A build.test.ts case
 * hit `flatFee`'s "amount greater than minimumAmountOut" check for exactly
 * this reason before this was corrected to the percentage `fee` option,
 * which PAY_PORTION is built for and which scales correctly with amountOut
 * instead of needing a fixed guess.
 */
export async function buildSwap(params: BuildSwapParams): Promise<BuiltSwap> {
  const { client, route, tokenIn, tokenOut, amountIn, nativeIn, nativeOut, slippageBps, recipient, deadline, feeBps, feeRecipient, permit } = params;

  const inputCurrency = currencyFor(tokenIn, nativeIn);
  const outputCurrency = currencyFor(tokenOut, nativeOut);

  const legCurrency = (address: Address, isEdge: boolean, edgeCurrency: Currency): Currency => {
    if (isEdge) return edgeCurrency;
    if (address.toLowerCase() === WETH9.toLowerCase() || address === ZERO_ADDRESS) {
      // An interior WETH9/native leg (only possible today via the USDG 2-hop
      // when one side is ETH) — always the wrapped form here, since it is
      // never the trade's own declared input/output.
      return new Token(robinhoodChain.id, WETH9, 18, "WETH");
    }
    return new Token(robinhoodChain.id, address, address.toLowerCase() === USDG.toLowerCase() ? 6 : 18);
  };

  const v3Routes: { routev3: V3Route<Currency, Currency>; inputAmount: CurrencyAmount<Currency>; outputAmount: CurrencyAmount<Currency> }[] = [];
  const v4Routes: { routev4: V4Route<Currency, Currency>; inputAmount: CurrencyAmount<Currency>; outputAmount: CurrencyAmount<Currency> }[] = [];

  if (route.legs.length === 1) {
    const leg = route.legs[0];
    if (leg.protocol === "v3") {
      const pool = await hydrateV3Pool(client, leg, inputCurrency, outputCurrency);
      v3Routes.push({
        routev3: new V3Route([pool], inputCurrency, outputCurrency),
        inputAmount: CurrencyAmount.fromRawAmount(inputCurrency, amountIn.toString()),
        outputAmount: CurrencyAmount.fromRawAmount(outputCurrency, leg.amountOut.toString()),
      });
    } else {
      const pool = await hydrateV4Pool(client, leg, inputCurrency, outputCurrency);
      v4Routes.push({
        routev4: new V4Route([pool], inputCurrency, outputCurrency),
        inputAmount: CurrencyAmount.fromRawAmount(inputCurrency, amountIn.toString()),
        outputAmount: CurrencyAmount.fromRawAmount(outputCurrency, leg.amountOut.toString()),
      });
    }
  } else if (route.legs.length === 2) {
    // Two independent single-hop routes chained through USDG (ETH <-> USDG
    // <-> STOCK) rather than one v4-style multi-hop path: the two legs can
    // be different protocol versions (that's the whole point — whichever
    // version actually has liquidity for each half), and router-sdk's
    // `Trade` constructor takes v3Routes/v4Routes as separate parallel
    // routes summed together, which is exactly this shape when each list
    // has one single-pool route contributing the full amount.
    const [leg1, leg2] = route.legs;
    const midCurrency = legCurrency(USDG, false, inputCurrency); // the shared USDG hop point is never itself the trade's declared in/out

    if (leg1.protocol === "v3") {
      const pool = await hydrateV3Pool(client, leg1, inputCurrency, midCurrency);
      v3Routes.push({
        routev3: new V3Route([pool], inputCurrency, midCurrency),
        inputAmount: CurrencyAmount.fromRawAmount(inputCurrency, amountIn.toString()),
        outputAmount: CurrencyAmount.fromRawAmount(midCurrency, leg1.amountOut.toString()),
      });
    } else {
      const pool = await hydrateV4Pool(client, leg1, inputCurrency, midCurrency);
      v4Routes.push({
        routev4: new V4Route([pool], inputCurrency, midCurrency),
        inputAmount: CurrencyAmount.fromRawAmount(inputCurrency, amountIn.toString()),
        outputAmount: CurrencyAmount.fromRawAmount(midCurrency, leg1.amountOut.toString()),
      });
    }

    if (leg2.protocol === "v3") {
      const pool = await hydrateV3Pool(client, leg2, midCurrency, outputCurrency);
      v3Routes.push({
        routev3: new V3Route([pool], midCurrency, outputCurrency),
        inputAmount: CurrencyAmount.fromRawAmount(midCurrency, leg1.amountOut.toString()),
        outputAmount: CurrencyAmount.fromRawAmount(outputCurrency, leg2.amountOut.toString()),
      });
    } else {
      const pool = await hydrateV4Pool(client, leg2, midCurrency, outputCurrency);
      v4Routes.push({
        routev4: new V4Route([pool], midCurrency, outputCurrency),
        inputAmount: CurrencyAmount.fromRawAmount(midCurrency, leg1.amountOut.toString()),
        outputAmount: CurrencyAmount.fromRawAmount(outputCurrency, leg2.amountOut.toString()),
      });
    }
  } else {
    throw new Error(`Unsupported route length: ${route.legs.length}`);
  }

  const trade = new RouterTrade({ v3Routes, v4Routes, tradeType: TradeType.EXACT_INPUT });

  const { calldata, value } = SwapRouter.swapCallParameters(trade, {
    slippageTolerance: new Percent(slippageBps, 10_000),
    recipient,
    deadlineOrPreviousBlockhash: deadline,
    fee: feeBps > 0 ? { fee: new Percent(feeBps, 10_000), recipient: feeRecipient } : undefined,
    inputTokenPermit: permit,
  });

  return { to: UNIVERSAL_ROUTER, data: calldata as `0x${string}`, value: BigInt(value) };
}

export async function getPermit2Allowance(
  client: PublicClient,
  owner: Address,
  token: Address,
  spender: Address
): Promise<{ amount: bigint; expiration: number; nonce: number }> {
  const ALLOWANCE_ABI = [
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

  const [amount, expiration, nonce] = await client.readContract({
    address: PERMIT2,
    abi: ALLOWANCE_ABI,
    functionName: "allowance",
    args: [owner, token, spender],
  });

  return { amount, expiration, nonce };
}
