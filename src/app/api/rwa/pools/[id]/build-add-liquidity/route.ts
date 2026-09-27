import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getSupabaseServer } from "@/lib/supabase";
import { getRobinhoodClient } from "@/lib/evm/client";
import { robinhoodChain } from "@/lib/chains";
import { buildAddLiquidity } from "@/lib/rwa/dex/lp";
import { USDG } from "@/lib/rwa/dex/addresses";

export const maxDuration = 20;

const DEFAULT_SLIPPAGE_BPS = 100;
const DEFAULT_DEADLINE_SECONDS = 20 * 60;

interface BuildAddLiquidityBody {
  /** Raw USDG units (6 decimals) the user wants to deposit — the matching stock-token amount is derived server-side from the pool's current price. */
  amountUsdgIn: string;
  recipient: string;
  slippageBps?: number;
}

/**
 * RWA_SPEC.md Phase 8's Pools page said "Adding liquidity — later"; this
 * is that later, v1 scope: full-range only (see dex/lp.ts's own note).
 * `[id]` is the v4 pool's `pool_id` (bytes32) from rwa_pools — v3 pools
 * aren't supported here, since V4_POSITION_MANAGER only mints v4
 * positions (a v3 LP flow would need the old NonfungiblePositionManager,
 * a separate feature).
 */
export async function POST(req: Request, ctx: RouteContext<"/api/rwa/pools/[id]/build-add-liquidity">) {
  const { id } = await ctx.params;

  let body: BuildAddLiquidityBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.recipient || !isAddress(body.recipient, { strict: false })) {
    return NextResponse.json({ error: "recipient must be a valid address" }, { status: 400 });
  }

  let amountUsdgIn: bigint;
  try {
    amountUsdgIn = BigInt(body.amountUsdgIn);
    if (amountUsdgIn <= 0n) throw new Error("non-positive");
  } catch {
    return NextResponse.json({ error: "amountUsdgIn must be a positive integer (raw USDG units)" }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  try {
    const { data: pool, error: poolError } = await supabase
      .from("rwa_pools")
      .select("pool_id, dex, token0, token1, fee, tick_spacing, hooks")
      .eq("chain_id", robinhoodChain.id)
      .eq("pool_id", id)
      .eq("dex", "uniswap_v4")
      .single();
    if (poolError || !pool) {
      return NextResponse.json({ error: "Unknown v4 pool" }, { status: 404 });
    }
    if (pool.tick_spacing === null || pool.hooks === null) {
      return NextResponse.json({ error: "Pool row is missing tick_spacing/hooks — re-run the registry cron" }, { status: 500 });
    }

    const nonUsdgAddress = pool.token0.toLowerCase() === USDG.toLowerCase() ? pool.token1 : pool.token0;
    const { data: tokenRow, error: tokenError } = await supabase
      .from("rwa_tokens")
      .select("decimals, symbol")
      .eq("chain_id", robinhoodChain.id)
      .eq("address", nonUsdgAddress)
      .single();
    if (tokenError || !tokenRow) {
      return NextResponse.json({ error: "Could not resolve the pool's non-USDG token" }, { status: 500 });
    }

    const client = getRobinhoodClient();
    const built = await buildAddLiquidity({
      client,
      token: nonUsdgAddress as Address,
      tokenDecimals: tokenRow.decimals,
      tokenSymbol: tokenRow.symbol,
      fee: pool.fee,
      tickSpacing: pool.tick_spacing,
      hooks: pool.hooks as Address,
      amountUsdgIn,
      recipient: body.recipient as Address,
      slippageBps: body.slippageBps ?? DEFAULT_SLIPPAGE_BPS,
      deadline: Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS,
    });

    return NextResponse.json({
      to: built.to,
      data: built.data,
      value: built.value.toString(),
      token: nonUsdgAddress,
      tokenDecimals: tokenRow.decimals,
      amountUsdgRequired: built.amountUsdgRequired,
      amountTokenRequired: built.amountTokenRequired,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
