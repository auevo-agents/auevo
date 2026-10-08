import { NextRequest, NextResponse } from "next/server";
import type { RoutesRequest, RoutesResponse } from "@lifi/types";
import { LIFI_INTEGRATOR, lifiFeeFraction, lifiFetch, LifiApiError } from "@/lib/rwa/lifi/client";

export const maxDuration = 15;

/**
 * RWA_SPEC.md Phase 4's server proxy for LI.FI's route-finding endpoint
 * (POST https://li.quest/v1/advanced/routes — see src/lib/rwa/lifi/client.ts
 * for how that URL/shape was verified from this sandbox). Both `/rwa/app/swap`'s
 * Swap tab (fromChainId === toChainId) and its Bridge tab (different chains)
 * hit this same endpoint — LI.FI treats a same-chain "route" as just the
 * best on-chain DEX aggregation, so there is no separate swap-only endpoint
 * to call.
 *
 * `integrator` and `fee` are injected here, server-side, rather than trusted
 * from the request body — same reasoning as dex/build.ts's platform fee:
 * a client-supplied fee could be tampered with, and the value is Auevo's
 * own configuration, not the caller's to set.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const { fromChainId, fromAmount, fromTokenAddress, fromAddress, toChainId, toTokenAddress, toAddress, order } = body;
  if (!fromChainId || !fromAmount || !fromTokenAddress || !toChainId || !toTokenAddress) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const fee = lifiFeeFraction();
  const request: RoutesRequest = {
    fromChainId: Number(fromChainId),
    fromAmount: String(fromAmount),
    fromTokenAddress,
    fromAddress: fromAddress || undefined,
    toChainId: Number(toChainId),
    toTokenAddress,
    toAddress: toAddress || fromAddress || undefined,
    options: {
      integrator: LIFI_INTEGRATOR,
      order: order === "FASTEST" ? "FASTEST" : "RECOMMENDED",
      ...(fee !== undefined ? { fee } : {}),
    },
  };

  try {
    const data = await lifiFetch<RoutesResponse>("/advanced/routes", { method: "POST", body: request });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof LifiApiError) {
      return NextResponse.json({ error: err.userMessage, lifiBody: err.body }, { status: err.status >= 400 && err.status < 600 ? err.status : 502 });
    }
    return NextResponse.json({ error: "Could not reach LI.FI" }, { status: 502 });
  }
}
