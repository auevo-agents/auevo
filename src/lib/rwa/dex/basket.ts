import type { Address } from "viem";
import { encodePacked, encodeFunctionData } from "viem";
import { RoutePlanner, CommandType, ROUTER_AS_RECIPIENT, type Permit2Permit } from "@uniswap/universal-router-sdk";
import { V4Planner, Actions } from "@uniswap/v4-sdk";

const FULL_DELTA_AMOUNT = 0n;
import { UNIVERSAL_ROUTER } from "./addresses";
import type { LegQuote, LegQuoteV3, LegQuoteV4 } from "./quote";

/**
 * Encodes N independent single-hop swaps into ONE UniversalRouter
 * execute() call — RWA_SPEC.md Phase 7's "buying a basket ... with one
 * signature" (a Strategy basket buy) and its mirror (a basket sell).
 * Every leg keeps its own input/output currency and amount; the only
 * thing shared across legs is the one wallet signature over the whole
 * transaction (plus, per leg, at most one *free, off-chain* Permit2
 * EIP-712 signature when that leg's own input token has no live
 * Permit2 allowance for UniversalRouter yet — see BasketLeg.permit
 * and build.ts's getPermit2Allowance, the same per-token check that
 * function's own caller already does for a single swap. Buying a
 * basket always has exactly one input token — the chosen quote asset
 * — so in practice that's at most one such signature; selling one can
 * need more, the first time a wallet sells a never-before-approved
 * holding).
 *
 * Deliberately NOT built on router-sdk's `Trade`/`SwapRouter.
 * swapCallParameters` (the abstraction build.ts's single-swap path
 * uses): `Trade`'s own constructor hard-invariants that every route in
 * a trade shares the same input AND output currency
 * (INPUT_CURRENCY_MATCH/OUTPUT_CURRENCY_MATCH, node_modules/@uniswap/
 * router-sdk/dist/.../entities/trade.js) — exactly the one thing a
 * basket needs to NOT be true (N different output tokens on a buy, N
 * different input tokens on a sell). So this hand-builds the
 * RoutePlanner/V4Planner command sequence one level below that
 * abstraction instead — the same level build.ts's own top comment
 * already flags as the fiddly one to get right, verified here
 * directly against the installed SDKs' own source rather than
 * assumed (v4Planner.js's real ABI definitions, routerCommands.js's
 * real CommandType/COMMAND_DEFINITION, UniversalRouter.sol's own
 * dispatch loop) before writing this.
 *
 * Researched first (this project's standing rule to research before
 * building a new block): no Uniswap doc, SDK example, or live basket/
 * portfolio product (TokenSets/Set Protocol, Index Coop, PieDAO,
 * Enzyme Finance, 1inch-based basket tokens) documents stacking
 * independent swaps this way — they all use a purpose-built vault
 * contract that itself loops over swaps internally, with the user
 * signing one call *to that contract*. Going through UniversalRouter
 * directly instead (no new contract at all) is a deliberate choice
 * here, not an oversight: this project cannot deploy any new contract
 * anyway (deploying / sending real transactions is strictly the
 * user's own action with their own key, never something done from
 * here — see contracts/README.md's own posture on DcaVault.sol), and
 * Uniswap's own UniversalRouter.sol dispatch loop places no
 * restriction on a commands array mixing multiple V3_SWAP_EXACT_IN
 * commands with one V4_SWAP command containing several chained
 * SWAP_EXACT_IN_SINGLE actions. Because it needs no new custodying
 * contract, this path also carries none of Phase 7's audit-gating
 * requirement — that requirement is specifically about DcaVault.sol.
 * Treat this as a novel-but-source-verified pattern, not a documented
 * one: there is no other product to point to if something about this
 * encoding turns out to be subtly wrong, which is exactly why every
 * struct/enum value below is read from the installed SDK source in
 * this same commit rather than typed from memory.
 *
 * v4 legs are batched into a SINGLE V4_SWAP command (one
 * SWAP_EXACT_IN_SINGLE action per leg, one shared SETTLE per distinct
 * input currency, one TAKE per leg) rather than one V4_SWAP command
 * per leg: V4Router's SETTLE/TAKE accounting is a per-currency delta
 * against the PoolManager, so legs sharing an input currency (always
 * true for a basket buy) settle that shared debt once instead of N
 * times — exactly what v4Planner.d.ts's own chainable addAction() API
 * is for. v3 legs can't join that same command (v3 routes through
 * different, SwapRouter02-shaped calldata), so each v3 leg gets its
 * own V3_SWAP_EXACT_IN command in the same plan instead — still one
 * execute(), one signature, just two command types side by side (the
 * same mixing build.ts's own 2-hop USDG case already relies on, just
 * parallel independent legs here rather than one chained path).
 *
 * All leg outputs land in router custody first (recipient =
 * ROUTER_AS_RECIPIENT / v4 TAKE to the router's own address) rather
 * than straight to the trader, so the platform fee can be deducted
 * exactly the way build.ts's single-swap path already does it
 * (PAY_PORTION, taken from output, never input — see build.ts's own
 * note on why). Legs are grouped by output currency first: a currency
 * that more than one leg produces (always true for a sell, where
 * every leg's output is the same quote asset) gets exactly ONE
 * PAY_PORTION + SWEEP over its combined balance, never one per leg —
 * PAY_PORTION deducts a fraction of whatever the router holds *at
 * that point in the plan*, so running it once per leg on a shared
 * currency would compound the fee instead of taking feeBps of the
 * true total.
 *
 * USDG-only: unlike build.ts's single-swap path, this does not
 * support a native-ETH leg. RWA_SPEC.md scopes baskets to USDG (the
 * quote asset for every RWA pool), and every basket constituent here
 * is quoted directly against USDG (quote.ts's bestLeg, not its 2-hop
 * quoteRoute) — there is no ETH-basket use case in the spec to build
 * WRAP_ETH/UNWRAP_WETH handling for.
 */

export interface BasketLeg {
  quote: LegQuote;
  amountIn: bigint;
  amountOutMinimum: bigint;
  /** Only set when this leg's own input token has no live Permit2 allowance for UniversalRouter yet. */
  permit?: Permit2Permit;
}

export interface BuildBasketSwapParams {
  legs: BasketLeg[];
  recipient: Address;
  deadline: number; // unix seconds
  feeBps: number;
  feeRecipient: Address;
}

export interface BuiltBasketSwap {
  to: Address;
  data: `0x${string}`;
  value: bigint;
}

const EXECUTE_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

function isV4Leg(leg: BasketLeg): leg is BasketLeg & { quote: LegQuoteV4 } {
  return leg.quote.protocol === "v4";
}

function isV3Leg(leg: BasketLeg): leg is BasketLeg & { quote: LegQuoteV3 } {
  return leg.quote.protocol === "v3";
}

export function buildBasketSwap(params: BuildBasketSwapParams): BuiltBasketSwap {
  const { legs, recipient, deadline, feeBps, feeRecipient } = params;
  if (legs.length === 0) throw new Error("buildBasketSwap: at least one leg is required");

  const planner = new RoutePlanner();

  // Permits are independent per leg (one leg's input-token permit says
  // nothing about another's), so each is emitted as its own command
  // before any ingress.
  for (const leg of legs) {
    if (leg.permit) {
      planner.addCommand(CommandType.PERMIT2_PERMIT, [leg.permit, leg.permit.signature]);
    }
  }

  // Ingress: one PERMIT2_TRANSFER_FROM per distinct input token, not
  // per leg — a basket buy has every leg sharing one input token and
  // must pull it exactly once for the combined amount.
  const inputTotals = new Map<Address, bigint>();
  for (const leg of legs) {
    const tokenIn = leg.quote.tokenIn;
    inputTotals.set(tokenIn, (inputTotals.get(tokenIn) ?? 0n) + leg.amountIn);
  }
  for (const [token, amount] of inputTotals) {
    planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [token, ROUTER_AS_RECIPIENT, amount]);
  }

  const v3Legs = legs.filter(isV3Leg);
  const v4Legs = legs.filter(isV4Leg);

  for (const leg of v3Legs) {
    const path = encodePacked(["address", "uint24", "address"], [leg.quote.tokenIn, leg.quote.fee, leg.quote.tokenOut]);
    planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
      ROUTER_AS_RECIPIENT,
      leg.amountIn,
      leg.amountOutMinimum,
      path,
      false, // payerIsUser: false — the router already holds the funds via the ingress above
    ]);
  }

  if (v4Legs.length > 0) {
    const v4Planner = new V4Planner();

    for (const leg of v4Legs) {
      v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [
        {
          poolKey: leg.quote.poolKey,
          zeroForOne: leg.quote.zeroForOne,
          amountIn: leg.amountIn,
          amountOutMinimum: leg.amountOutMinimum,
          hookData: "0x",
        },
      ]);
    }

    // addSettle/addTake (V4Planner's own convenience wrappers) take SDK
    // `Currency` objects, not raw addresses — building Token instances
    // here just to satisfy that would need a chainId/decimals this
    // module otherwise has no use for. addAction() with the raw
    // Actions.SETTLE_ALL/TAKE ABI (v4Planner.js's own
    // V4_BASE_ACTIONS_ABI_DEFINITION, both plain `address` params) does
    // the identical encoding without that detour.
    const v4InputTotals = new Map<Address, bigint>();
    for (const leg of v4Legs) {
      v4InputTotals.set(leg.quote.tokenIn, (v4InputTotals.get(leg.quote.tokenIn) ?? 0n) + leg.amountIn);
    }
    for (const [currency, maxAmount] of v4InputTotals) {
      v4Planner.addAction(Actions.SETTLE_ALL, [currency, maxAmount]);
    }
    for (const leg of v4Legs) {
      // amount=FULL_DELTA_AMOUNT (0): takes whatever the pool actually owes this leg, not a floor.
      v4Planner.addAction(Actions.TAKE, [leg.quote.tokenOut, ROUTER_AS_RECIPIENT, FULL_DELTA_AMOUNT]);
    }

    planner.addCommand(CommandType.V4_SWAP, [v4Planner.finalize()]);
  }

  // Fees + settlement, grouped by output currency (see this file's own
  // doc comment on why a shared output currency gets one PAY_PORTION,
  // not one per leg).
  const outputTotals = new Map<Address, bigint>();
  for (const leg of legs) {
    outputTotals.set(leg.quote.tokenOut, (outputTotals.get(leg.quote.tokenOut) ?? 0n) + leg.amountOutMinimum);
  }
  for (const [token, minAmountOutGross] of outputTotals) {
    if (feeBps > 0) {
      planner.addCommand(CommandType.PAY_PORTION, [token, feeRecipient, BigInt(feeBps)]);
      const minAmountOutNet = minAmountOutGross - (minAmountOutGross * BigInt(feeBps)) / 10_000n;
      planner.addCommand(CommandType.SWEEP, [token, recipient, minAmountOutNet]);
    } else {
      planner.addCommand(CommandType.SWEEP, [token, recipient, minAmountOutGross]);
    }
  }

  const { commands, inputs } = planner;
  const data = encodeFunctionData({
    abi: EXECUTE_ABI,
    functionName: "execute",
    args: [commands as `0x${string}`, inputs as `0x${string}`[], BigInt(deadline)],
  });

  return { to: UNIVERSAL_ROUTER, data, value: 0n };
}
