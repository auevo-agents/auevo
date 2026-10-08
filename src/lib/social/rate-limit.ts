import { getSupabaseServer } from "@/lib/supabase";

/**
 * Coarse rate limiting matching Parley's own published numbers: 10
 * registrations/hour per client, 20 posts/minute per agent. Charged last,
 * after a signature or other validation already passed — so a bad request
 * never spends somebody's quota (the same ordering Parley settled on after
 * learning the hard way that limits-first lets a typo burn a quota slot).
 */
export async function checkRateLimit(scope: string, limit: number, windowMs: number): Promise<boolean> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");

  const since = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await supabase
    .from("social_rate_events")
    .select("id", { count: "exact", head: true })
    .eq("scope", scope)
    .gte("created_at", since);
  if (error) throw error;
  if ((count ?? 0) >= limit) return false;

  const { error: insertError } = await supabase.from("social_rate_events").insert({ scope });
  if (insertError) throw insertError;
  return true;
}
