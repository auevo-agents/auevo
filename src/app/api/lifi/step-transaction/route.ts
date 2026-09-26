import { NextRequest, NextResponse } from "next/server";
import type { LiFiStep } from "@lifi/types";
import { lifiFetch, LifiApiError } from "@/lib/rwa/lifi/client";

export const maxDuration = 15;

/**
 * RWA_SPEC.md Phase 4: populates one route step with real transaction data
 * (POST https://li.quest/v1/advanced/stepTransaction — confirmed by reading
 * @lifi/sdk's own `dist/cjs/actions/getStepTransaction.js`, which POSTs the
 * step object itself, unmodified, to exactly this path). The client sends
 * back one step object from a route it got via /api/lifi/routes; this route
 * round-trips it to LI.FI and returns the same step with `transactionRequest`
 * filled in, ready for wagmi's `useSendTransaction`.
 *
 * A thin pass-through on purpose — LI.FI's own backend is what knows how to
 * encode a given bridge/DEX's calldata, and re-deriving that here would mean
 * re-implementing every integrated protocol ourselves.
 */
export async function POST(req: NextRequest) {
  const step = (await req.json().catch(() => null)) as LiFiStep | null;
  if (!step || typeof step !== "object" || !step.action || !step.estimate) {
    return NextResponse.json({ error: "Invalid step" }, { status: 400 });
  }

  try {
    const data = await lifiFetch<LiFiStep>("/advanced/stepTransaction", { method: "POST", body: step });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof LifiApiError) {
      return NextResponse.json({ error: err.message, lifiBody: err.body }, { status: err.status >= 400 && err.status < 600 ? err.status : 502 });
    }
    return NextResponse.json({ error: "Could not reach LI.FI" }, { status: 502 });
  }
}
