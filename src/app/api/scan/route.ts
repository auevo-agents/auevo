import { NextRequest, NextResponse } from "next/server";
import { scanWallet } from "@/lib/scan";

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
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
