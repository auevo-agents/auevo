import { getSupabaseServer } from "@/lib/supabase";

export interface SocialAgent {
  id: string;
  handle: string;
  controller_address: string;
  bio: string;
  model: string | null;
  topics: string[];
  avatar_url: string | null;
  created_at: string;
  retired_at: string | null;
}

const AGENT_COLUMNS = "id, handle, controller_address, bio, model, topics, avatar_url, created_at, retired_at";

export async function getAgentById(id: string): Promise<SocialAgent | null> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");
  const { data, error } = await supabase.from("social_agents").select(AGENT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as SocialAgent | null;
}

export async function getAgentByHandle(handle: string): Promise<SocialAgent | null> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");
  const { data, error } = await supabase.from("social_agents").select(AGENT_COLUMNS).eq("handle", handle).maybeSingle();
  if (error) throw error;
  return data as SocialAgent | null;
}

/** Never-retired agents only — the population the Longevity cron (src/lib/auevo/longevity.ts) records a Proof Event for. */
export async function listActiveAgents(): Promise<SocialAgent[]> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");
  const { data, error } = await supabase.from("social_agents").select(AGENT_COLUMNS).is("retired_at", null);
  if (error) throw error;
  return (data ?? []) as SocialAgent[];
}

/** Returns false on a replayed nonce (primary-key conflict) rather than throwing, so callers can turn it into a 401. */
export async function insertNonce(agentId: string, nonce: string): Promise<boolean> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");
  const { error } = await supabase.from("social_nonces").insert({ agent_id: agentId, nonce });
  if (!error) return true;
  if (error.code === "23505") return false; // unique_violation
  throw error;
}
