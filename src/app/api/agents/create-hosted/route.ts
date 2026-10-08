import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/social/rate-limit";
import { generateHostedControllerAddress, generateRunSecret, hashRunSecret, isLikelyOrbioKey } from "@/lib/auevo/hosted-agent";
import { encryptSecret } from "@/lib/auevo/key-encryption";
import { EXECUTOR_ALLOWED_MODELS } from "@/lib/auevo/executor-models";
import { isEntityKind } from "@/app/agents/garden/entity-catalog";

export const runtime = "nodejs";

const HANDLE_RE = /^[a-z0-9_]{3,32}$/;

/**
 * "Create an agent" (execution-plan doc §1) — the counterpart to
 * /api/agents/register's wallet-signed "Connect your agent" path. No
 * wallet, no signature: the browser gets back a run secret instead,
 * which is the only thing that proves it may later trigger this agent's
 * executor runs (see /api/agents/[id]/run). The profile this creates is
 * NOT yet a working agent — nothing has called a model for it — the UI
 * must keep saying so until its first run completes (doc §1's own
 * "creating a profile and creating a working AI agent are different states").
 */
export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const allowed = await checkRateLimit(`create-hosted:${ip}`, 10, 60 * 60 * 1000);
    if (!allowed) return NextResponse.json({ error: "Too many agents created from this address, try later" }, { status: 429 });

    const body = await req.json();
    const handle = typeof body.handle === "string" ? body.handle.toLowerCase().replace(/^#/, "") : "";
    const bio = typeof body.bio === "string" ? body.bio.slice(0, 280) : "";
    const requestedModel = typeof body.model === "string" ? body.model : "";
    const topics = Array.isArray(body.topics) ? body.topics.filter((t: unknown) => typeof t === "string").slice(0, 10) : [];
    const avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl : null;
    const entityKind = isEntityKind(body.entityKind) ? body.entityKind : null;

    // Bring-your-own-key (Orbio, orbio.so — see migration 0035): optional.
    // Give no key and nothing changes — AUEVO still runs this agent on its
    // own ANTHROPIC_API_KEY, restricted to EXECUTOR_ALLOWED_MODELS, exactly
    // as before. Give one and the model field is trusted as-is (any model
    // string Orbio accepts), since it's the owner's own account and cost
    // from here on, not AUEVO's — AUEVO only validates the key SHAPE, not
    // that it actually works (the first run will surface that honestly).
    const orbioApiKey = typeof body.orbioApiKey === "string" ? body.orbioApiKey.trim() : "";
    if (orbioApiKey && !isLikelyOrbioKey(orbioApiKey)) {
      return NextResponse.json({ error: "orbioApiKey doesn't look like an Orbio key (expected sk-orbio-...)" }, { status: 400 });
    }
    const model = orbioApiKey
      ? requestedModel.slice(0, 80) || EXECUTOR_ALLOWED_MODELS[0]
      : (EXECUTOR_ALLOWED_MODELS as readonly string[]).includes(requestedModel)
        ? requestedModel
        : EXECUTOR_ALLOWED_MODELS[0];

    if (!HANDLE_RE.test(handle)) return NextResponse.json({ error: "handle must be 3-32 chars of [a-z0-9_]" }, { status: 400 });

    // Encrypt BEFORE anything is written — if AGENT_KEY_ENCRYPTION_KEY is
    // missing or malformed this throws here, before the social_agents
    // insert below, so no orphaned agent row is ever left behind by a
    // misconfigured server (it was, before this was moved up: encrypting
    // inline inside the second insert's payload meant a throw there
    // skipped the keyError rollback entirely, since it's a JS exception,
    // not a Supabase error the existing `if (keyError)` branch could see).
    const orbioApiKeyEnc = orbioApiKey ? encryptSecret(orbioApiKey) : null;

    const supabase = getSupabaseServer();
    if (!supabase) throw new Error("Supabase is not configured on the server");

    const controllerAddress = generateHostedControllerAddress();
    const { data: agent, error } = await supabase
      .from("social_agents")
      .insert({ handle, controller_address: controllerAddress, bio, model, topics, avatar_url: avatarUrl, is_hosted: true, entity_kind: entityKind })
      .select("id, handle, bio, model, topics, avatar_url, created_at")
      .single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "Handle already taken" }, { status: 409 });
      throw error;
    }

    const runSecret = generateRunSecret();
    const { error: keyError } = await supabase.from("auevo_hosted_agent_keys").insert({
      agent_id: agent.id,
      run_secret_hash: hashRunSecret(runSecret),
      orbio_api_key_enc: orbioApiKeyEnc,
      byok_model: orbioApiKey ? model : null,
    });
    if (keyError) {
      await supabase.from("social_agents").delete().eq("id", agent.id);
      throw keyError;
    }

    // runSecret is returned exactly once — only its hash is ever stored.
    // orbioApiKey is never echoed back at all, encrypted or not — the
    // browser already has it (it just typed it in) and has no reason to
    // read it back from us.
    return NextResponse.json({ ...agent, runSecret, byok: Boolean(orbioApiKey) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
