import { NextResponse } from "next/server";
import { fetchKaminoMarketReserves } from "@/lib/rwa/kamino";

export const maxDuration = 15;

/**
 * RWA_SPEC.md Phase 8's /app/lend — read-only Kamino xStocks rates.
 * KAMINO_XSTOCKS_MARKET_PUBKEY starts unset on purpose (see
 * lib/rwa/kamino.ts's own doc comment on why the actual pubkey couldn't
 * be confirmed from this environment) — this route says so plainly
 * rather than guessing one, same pattern as /api/dex/permit-typed-data's
 * neighbors when a required address isn't configured.
 */
export async function GET() {
  const marketPubkey = process.env.KAMINO_XSTOCKS_MARKET_PUBKEY;
  if (!marketPubkey) {
    return NextResponse.json({ configured: false, reserves: [] });
  }

  const reserves = await fetchKaminoMarketReserves(marketPubkey);
  if (reserves === null) {
    return NextResponse.json(
      { configured: true, error: "Kamino's API didn't return the expected shape — see lib/rwa/kamino.ts", reserves: [] },
      { status: 502 }
    );
  }

  return NextResponse.json({ configured: true, reserves });
}
