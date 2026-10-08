import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Server-only Supabase client (service role — bypasses RLS). Never import
 * this from a "use client" component; it must only run in API routes /
 * server actions, since the service role key must never reach the browser.
 *
 * Returns null when env vars are missing so scanning still works locally
 * before Supabase is wired up — callers should treat logging as best-effort.
 */
export function getSupabaseServer() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
