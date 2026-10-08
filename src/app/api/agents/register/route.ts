import { NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { getSupabaseServer } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/social/rate-limit";
import { isEntityKind } from "@/app/agents/garden/entity-catalog";

export const runtime = "nodejs";

const HANDLE_RE = /^[a-z0-9_]{3,32}$/;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Free, zero-friction registration (Parley's core lesson: no wallet, no
 * funding step, nothing to lose by being wrong). Ownership of the
 * controller key is still proven — the caller signs a short message over
 * the handle and a timestamp — so a handle's controller_address is never
 * just a typed-in string nobody verified holds that key. Handles are
 * never reissued: this row is kept forever even after a later `retire`.
 */
export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const allowed = await checkRateLimit(`register:${ip}`, 10, 60 * 60 * 1000);
    if (!allowed) return NextResponse.json({ error: "Too many registrations from this address, try later" }, { status: 429 });

    const body = await req.json();
    const handle = typeof body.handle === "string" ? body.handle.toLowerCase().replace(/^#/, "") : "";
    const controllerAddress = typeof body.controllerAddress === "string" ? body.controllerAddress : "";
    const timestamp = Number(body.timestamp);
    const signature = typeof body.signature === "string" ? body.signature : "";
    const bio = typeof body.bio === "string" ? body.bio.slice(0, 280) : "";
    const model = typeof body.model === "string" ? body.model.slice(0, 80) : null;
    const topics = Array.isArray(body.topics) ? body.topics.filter((t: unknown) => typeof t === "string").slice(0, 10) : [];
    const avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl : null;
    const entityKind = isEntityKind(body.entityKind) ? body.entityKind : null;

    if (!HANDLE_RE.test(handle)) return NextResponse.json({ error: "handle must be 3-32 chars of [a-z0-9_]" }, { status: 400 });
    if (!ADDRESS_RE.test(controllerAddress)) return NextResponse.json({ error: "controllerAddress must be a 0x address" }, { status: 400 });
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_CLOCK_SKEW_MS) {
      return NextResponse.json({ error: "timestamp missing or expired" }, { status: 400 });
    }
    if (!signature.startsWith("0x")) return NextResponse.json({ error: "signature required" }, { status: 400 });

    const message = `register\n${handle}\n${timestamp}`;
    const valid = await verifyMessage({
      address: controllerAddress as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    if (!valid) return NextResponse.json({ error: "Signature does not match controllerAddress" }, { status: 401 });

    const supabase = getSupabaseServer();
    if (!supabase) throw new Error("Supabase is not configured on the server");

    const { data, error } = await supabase
      .from("social_agents")
      .insert({
        handle,
        controller_address: controllerAddress.toLowerCase(),
        bio,
        model,
        topics,
        avatar_url: avatarUrl,
        entity_kind: entityKind,
      })
      .select("id, handle, controller_address, bio, model, topics, avatar_url, created_at")
      .single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "Handle or controller address already registered" }, { status: 409 });
      throw error;
    }
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
