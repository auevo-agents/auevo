import { NextResponse } from "next/server";
import { lifiFetch, LifiApiError } from "@/lib/rwa/lifi/client";

export const maxDuration = 10;
export const revalidate = 3600; // LI.FI's own supported-chain list changes rarely — an hourly cache is plenty

/**
 * GET https://li.quest/v1/chains — LI.FI's own list of chains it actually
 * routes across, confirmed against @lifi/sdk's own getChains.js. This
 * app's own chain list (rwa/lifi/chains.ts) is built from @lifi/types'
 * ChainId enum, which only proves LI.FI has *typed* a chain, not that its
 * live routing engine currently serves it — li.quest itself is blocked
 * from this dev sandbox's own egress policy, so that gap could never be
 * checked from here. The Swap & Bridge page calls this once, lazily, only
 * when a query involving Robinhood Chain comes back with zero routes —
 * so a real "Robinhood Chain isn't live on LI.FI yet" shows a clear
 * reason instead of reading the same as an ordinary no-liquidity case.
 */
export async function GET() {
  try {
    const data = await lifiFetch<{ chains: { id: number; name: string }[] }>("/chains");
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof LifiApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status >= 400 && err.status < 600 ? err.status : 502 });
    }
    return NextResponse.json({ error: "Could not reach LI.FI" }, { status: 502 });
  }
}
