import { getSupabaseServer } from "@/lib/supabase";

/**
 * Every wallet_* table's rows carry a foreign key to wallet_profiles
 * (privy_user_id). Rather than require the client to call POST
 * /api/wallet/profile before it can create its first agent or chat, every
 * route that inserts a child row calls this first — an idempotent
 * `insert ... on conflict do nothing`, cheap enough to run on every write.
 */
export async function ensureProfile(privyUserId: string) {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");
  const { error } = await supabase
    .from("wallet_profiles")
    .upsert({ privy_user_id: privyUserId }, { onConflict: "privy_user_id", ignoreDuplicates: true });
  if (error) throw error;
  return supabase;
}
