import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { getAgentByController } from "@/lib/social/db";

export const runtime = "nodejs";

/**
 * Lets a connected wallet find the one agent it already registered —
 * controller_address is DB-unique (see /api/agents/register's 23505
 * handling), so this is always at most a single row. Used by
 * useWalletAgent (src/app/wallet-agent.tsx) so Play Zone flows stop
 * re-asking a wallet that already has an agent to register again on
 * every navigation. Returns only the public id/handle — never bio,
 * model or anything else a full Passport fetch would include.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  try {
    const { address } = await params;
    if (!isAddress(address)) return NextResponse.json({ error: "Invalid address" }, { status: 400 });

    const agent = await getAgentByController(address.toLowerCase());
    if (!agent) return NextResponse.json({ error: "No agent registered for this wallet" }, { status: 404 });

    return NextResponse.json({ id: agent.id, handle: agent.handle });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
