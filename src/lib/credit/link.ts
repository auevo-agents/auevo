import { getSupabaseServer } from "@/lib/supabase";

/**
 * The handle<->creditAgentId bridge (see supabase/migrations/0034_credit_identity_link.sql
 * and docs/CREDIT_SPEC.md §4 — the two identity registries are
 * independent namespaces, this table is the only link between them).
 * Only ever set by POST /api/credit/link, which requires a signature
 * from the SAME wallet already on file as that handle's
 * controller_address — the same trust model /api/agents/register
 * already uses, not a new one.
 */
export async function getCreditAgentIdForHandle(handle: string): Promise<bigint | null> {
  const supabase = getSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase
    .from("social_agents")
    .select("credit_agent_id")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();
  if (!data?.credit_agent_id) return null;
  return BigInt(data.credit_agent_id);
}

/** Reverse lookup, for the /credit/agents directory — one query for every linked agent at once. */
export async function listHandlesWithCreditAgentId(handles: string[]): Promise<Map<string, bigint>> {
  const supabase = getSupabaseServer();
  const map = new Map<string, bigint>();
  if (!supabase || handles.length === 0) return map;
  const { data } = await supabase
    .from("social_agents")
    .select("handle, credit_agent_id")
    .in(
      "handle",
      handles.map((h) => h.toLowerCase())
    )
    .not("credit_agent_id", "is", null);
  for (const row of data ?? []) {
    if (row.credit_agent_id != null) map.set(row.handle, BigInt(row.credit_agent_id));
  }
  return map;
}

export async function setCreditAgentIdForHandle(handle: string, controllerAddress: string, agentId: bigint): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase is not configured on the server" };

  const { data: agent, error: fetchError } = await supabase
    .from("social_agents")
    .select("controller_address, credit_agent_id")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();
  if (fetchError || !agent) return { ok: false, error: "No agent registered with that handle" };
  if (agent.controller_address.toLowerCase() !== controllerAddress.toLowerCase()) {
    return { ok: false, error: "This handle's controller address does not match the signing wallet" };
  }
  if (agent.credit_agent_id != null) return { ok: false, error: "This handle is already linked to a credit agent id" };

  const { error: updateError } = await supabase
    .from("social_agents")
    .update({ credit_agent_id: agentId.toString() })
    .eq("handle", handle.toLowerCase());
  if (updateError) {
    if (updateError.code === "23505") return { ok: false, error: "That credit agent id is already linked to a different handle" };
    return { ok: false, error: updateError.message };
  }
  return { ok: true };
}
