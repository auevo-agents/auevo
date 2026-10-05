import { NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { setCreditAgentIdForHandle } from "@/lib/credit/link";
import { checkRateLimit } from "@/lib/social/rate-limit";

export const runtime = "nodejs";

const HANDLE_RE = /^[a-z0-9_]{3,32}$/;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Links an AUEVO handle (social_agents) to an agent id this same wallet
 * just minted on the SEPARATE Credit identity registry (register() on
 * CREDIT_IDENTITY_ADDRESS — see src/app/credit/register-panel.tsx).
 * Proof of control is a signed message, exactly the trust model
 * POST /api/agents/register already uses for controller_address — this
 * route only works for a "Connect your agent" handle, since a hosted
 * agent's controller key is never persisted for it to sign with.
 */
export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const allowed = await checkRateLimit(`credit-link:${ip}`, 10, 60 * 60 * 1000);
    if (!allowed) return NextResponse.json({ error: "Too many attempts, try later" }, { status: 429 });

    const body = await req.json();
    const handle = typeof body.handle === "string" ? body.handle.toLowerCase().replace(/^#/, "") : "";
    const address = typeof body.address === "string" ? body.address : "";
    const agentIdStr = typeof body.agentId === "string" ? body.agentId : "";
    const timestamp = Number(body.timestamp);
    const signature = typeof body.signature === "string" ? body.signature : "";

    if (!HANDLE_RE.test(handle)) return NextResponse.json({ error: "handle must be 3-32 chars of [a-z0-9_]" }, { status: 400 });
    if (!ADDRESS_RE.test(address)) return NextResponse.json({ error: "address must be a 0x address" }, { status: 400 });
    if (!/^\d+$/.test(agentIdStr)) return NextResponse.json({ error: "agentId must be a non-negative integer" }, { status: 400 });
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_CLOCK_SKEW_MS) {
      return NextResponse.json({ error: "timestamp missing or expired" }, { status: 400 });
    }
    if (!signature.startsWith("0x")) return NextResponse.json({ error: "signature required" }, { status: 400 });

    const message = `link-credit\n${handle}\n${agentIdStr}\n${timestamp}`;
    const valid = await verifyMessage({ address: address as `0x${string}`, message, signature: signature as `0x${string}` });
    if (!valid) return NextResponse.json({ error: "Signature does not match address" }, { status: 401 });

    const result = await setCreditAgentIdForHandle(handle, address, BigInt(agentIdStr));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ handle, agentId: agentIdStr }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
