import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const maxDuration = 15;

const LIMIT = 200;

/**
 * RWA_SPEC.md section 6's /app/explorer — "our transactions", i.e. every
 * swap/bridge this app itself has sent through (app_transfers, written by
 * /api/dex/record for both Phase 2's Robinhood-only v3/v4 swaps and Phase
 * 4's LI.FI same-chain/cross-chain ones). Optionally filtered to one
 * connected wallet via ?account=.
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ indexed: false, transfers: [] });

  const { searchParams } = new URL(req.url);
  const account = searchParams.get("account");

  let query = supabase
    .from("app_transfers")
    .select("id, account, recipient, chain_id, to_chain_id, src_token, dst_token, amount_in, amount_out, route, bridge_tool, fee_bps, tx_hash, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (account) query = query.ilike("account", account);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: `Could not read app_transfers: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    indexed: true,
    transfers: (data ?? []).map((t) => ({
      id: t.id,
      account: t.account,
      recipient: t.recipient,
      chainId: t.chain_id,
      toChainId: t.to_chain_id,
      srcToken: t.src_token,
      dstToken: t.dst_token,
      amountIn: t.amount_in,
      amountOut: t.amount_out,
      route: t.route,
      bridgeTool: t.bridge_tool,
      feeBps: t.fee_bps,
      txHash: t.tx_hash,
      status: t.status,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    })),
  });
}
