import { NextRequest, NextResponse } from "next/server";
import { scanWallet } from "@/lib/scan";
import { getSupabaseServer } from "@/lib/supabase";

// Very active wallets now paginate up to 60 sequential Helius calls (see
// scan.ts MAX_PAGES) instead of 20, so the default serverless timeout isn't
// enough headroom. 60s is the max on Vercel's Hobby plan without Fluid
// Compute; if scans for heavy wallets still time out, this is the first
// thing to check — either this needs Vercel's paid tier for more, or
// MAX_PAGES needs to come back down.
export const maxDuration = 60;

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
