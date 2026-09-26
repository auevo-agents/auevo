import { NextResponse } from "next/server";
import { resolveQuoteAssets } from "@/lib/rwa/quote-assets";

export const maxDuration = 15;

/**
 * RWA_SPEC.md Phase 6's USD-denominated Portfolio needs each recognized
 * quote asset's live USD price (see rwa/quote-assets.ts) client-side, to
 * feed wallet-positions.ts's aggregatePositionsUsd/evaluatePositionUsd —
 * the actual position math still runs in the browser (same place the
 * existing ETH-denominated positions are computed, since it needs
 * balanceOf/decimals reads via the connected wallet's own RPC), this just
 * hands it the USD prices a server-side GeckoTerminal call resolved.
 */
export async function GET() {
  const assets = await resolveQuoteAssets();
  return NextResponse.json({ assets });
}
