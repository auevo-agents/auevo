import { NextRequest, NextResponse } from "next/server";
import { scanWallet } from "@/lib/scan";
import { getSupabaseServer } from "@/lib/supabase";

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function POST(req: NextRequest) {
  let body: { wallet?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const wallet = body.wallet?.trim();
  if (!wallet || !SOLANA_ADDRESS_RE.test(wallet)) {
    return NextResponse.json(
      { error: "Provide a valid Solana wallet address" },
      { status: 400 }
    );
  }

  try {
    const result = await scanWallet(wallet);
    logScan(result).catch((err) => console.error("scan logging failed:", err));
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Best-effort analytics log — this is the data source for deciding what to
 * build next (which bots people actually use, how many scan vs. share).
 * Never blocks or fails the user-facing response.
 */
async function logScan(result: Awaited<ReturnType<typeof scanWallet>>) {
  const supabase = getSupabaseServer();
  if (!supabase) return; // Supabase not configured yet — skip silently

  await supabase.from("scans").insert({
    wallet: result.wallet,
    chain: result.chain,
    total_usd: result.totalUsd,
    total_sol: result.totalSol,
    bot_trades: result.totalBotTrades,
    tx_scanned: result.totalTxScanned,
    breakdown: result.breakdown,
  });
}
