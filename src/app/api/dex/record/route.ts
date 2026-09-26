import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { robinhoodChain } from "@/lib/chains";

export const maxDuration = 10;

/**
 * The app's own trade log (RWA_SPEC.md section 5's `app_transfers`,
 * section 6's Explorer page) — a swap this app itself sent through
 * UniversalRouter, not a general activity feed. No-ops when Supabase
 * isn't configured, same posture as every other optional-persistence
 * route in this app (see api/cron/index-chain, api/wallets/.../activity).
 *
 * Two calls per swap: POST right after building calldata (before the
 * user even signs, status "pending") so a swap the user then rejects
 * still leaves an honest record; PATCH once a receipt confirms fill or
 * failure. There is deliberately no "insert on success only" path — a
 * dropped browser tab between building and confirming should still show
 * up as a stuck "pending" row rather than vanish.
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ recorded: false });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const { account, recipient, srcToken, dstToken, amountIn, route, feeBps } = body;
  if (!account || !recipient || !srcToken || !dstToken || !amountIn || !route) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("app_transfers")
    .insert({
      account,
      recipient,
      chain_id: robinhoodChain.id,
      src_token: srcToken,
      dst_token: dstToken,
      amount_in: amountIn,
      route,
      fee_bps: feeBps ?? 0,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: `Could not record transfer: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ recorded: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ recorded: false });

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { id, txHash, status, amountOut } = body;
  if (status && !["pending", "done", "partial", "refunded", "failed"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { error } = await supabase
    .from("app_transfers")
    .update({
      ...(txHash ? { tx_hash: txHash } : {}),
      ...(status ? { status } : {}),
      ...(amountOut ? { amount_out: amountOut } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: `Could not update transfer: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ recorded: true });
}
