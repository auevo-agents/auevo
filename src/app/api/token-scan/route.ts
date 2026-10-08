import { NextRequest, NextResponse } from "next/server";
import { RpcUnavailableError } from "@/lib/evm/client";
import { NotAnAddressError, scanToken } from "@/lib/token-security";

/**
 * The deep checks (deployment age by binary search, holder distribution
 * from Transfer logs) hold their own ~30s budget and degrade instead of
 * hanging, but a slow public RPC can still push a scan past the default
 * serverless timeout. 60s is the Vercel Hobby ceiling without Fluid
 * Compute — same constraint the Solana fee scan runs under.
 */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const address = body.address?.trim();
  if (!address) {
    return NextResponse.json(
      { error: "Provide a token contract address" },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await scanToken(address));
  } catch (err) {
    if (err instanceof NotAnAddressError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    // A node outage must never read as a verdict about the token.
    if (err instanceof RpcUnavailableError) {
      console.error("Robinhood Chain RPC unavailable:", err.cause ?? err);
      return NextResponse.json(
        {
          error:
            "Can't reach Robinhood Chain right now. This is our connection to the network, not a result for this token — try again shortly.",
        },
        { status: 503 }
      );
    }

    console.error("token scan failed:", err);
    return NextResponse.json(
      { error: "Scan failed — try again" },
      { status: 500 }
    );
  }
}
