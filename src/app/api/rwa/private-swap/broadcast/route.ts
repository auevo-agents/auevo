import { NextResponse } from "next/server";
import { broadcastPrivately, isPrivateSwapConfigured, PrivateSwapNotConfiguredError } from "@/lib/rwa/private-swap";

export const maxDuration = 15;

interface BroadcastBody {
  signedTx: string;
}

/**
 * Relays an already wallet-signed raw transaction to the configured
 * private RPC — see lib/rwa/private-swap.ts's own doc comment. This
 * route never sees a private key or an unsigned intent, only a
 * fully-signed transaction the caller's own wallet produced; a 501 here
 * just means this deployment has no private endpoint configured, and the
 * swap panel falls back to a normal transaction when it sees that.
 */
export async function POST(req: Request) {
  if (!isPrivateSwapConfigured()) {
    return NextResponse.json({ error: "Private swap is not configured on this deployment" }, { status: 501 });
  }

  let body: BroadcastBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.signedTx !== "string" || !body.signedTx.startsWith("0x")) {
    return NextResponse.json({ error: "signedTx must be a 0x-prefixed raw signed transaction" }, { status: 400 });
  }

  try {
    const hash = await broadcastPrivately(body.signedTx as `0x${string}`);
    return NextResponse.json({ hash });
  } catch (err) {
    if (err instanceof PrivateSwapNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 501 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
