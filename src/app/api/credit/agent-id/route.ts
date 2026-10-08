import { NextResponse } from "next/server";
import { findCreditAgentIdForOwner } from "@/lib/credit/contract";

export const runtime = "nodejs";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/** Lets register-panel.tsx recover "I already have a credit agent id" after a page refresh, instead of only ever knowing it from the receipt of a register() sent moments earlier. See findCreditAgentIdForOwner. */
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address") ?? "";
  if (!ADDRESS_RE.test(address)) return NextResponse.json({ error: "address must be a 0x address" }, { status: 400 });

  const agentId = await findCreditAgentIdForOwner(address as `0x${string}`);
  return NextResponse.json({ agentId: agentId !== null ? agentId.toString() : null });
}
