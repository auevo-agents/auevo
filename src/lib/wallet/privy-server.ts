import { PrivyClient } from "@privy-io/server-auth";

/**
 * Server-only Privy client — verifies the access token a wallet API route
 * receives from the browser (Privy's `getAccessToken()`) and returns the
 * user's stable `did:privy:...` id. Every wallet API route calls
 * `requirePrivyUserId` before touching Supabase: the service-role client
 * (see src/lib/supabase.ts) bypasses RLS entirely, so this check is the
 * *only* thing standing between an unauthenticated request and another
 * user's chats/agents/activity.
 *
 * Never import this from a "use client" component — PRIVY_APP_SECRET must
 * stay server-only, same rule as SUPABASE_SERVICE_ROLE_KEY.
 */

let cached: PrivyClient | undefined;

function getPrivyClient(): PrivyClient | null {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) return null;
  if (!cached) cached = new PrivyClient(appId, appSecret);
  return cached;
}

export class PrivyAuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "PrivyAuthError";
  }
}

/** Pulls the bearer token out of an incoming request's Authorization header. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

/**
 * Verifies the request's Privy access token and returns the caller's
 * privy_user_id. Throws PrivyAuthError for anything short of a valid,
 * verified token — routes should catch this and return 401, never fall
 * back to treating the request as anonymous or trusting a client-supplied
 * user id instead.
 */
export async function requirePrivyUserId(req: Request): Promise<string> {
  const client = getPrivyClient();
  if (!client) throw new PrivyAuthError("Privy is not configured on the server");

  const token = bearerToken(req);
  if (!token) throw new PrivyAuthError("Missing bearer token");

  try {
    const claims = await client.verifyAuthToken(token);
    return claims.userId;
  } catch {
    throw new PrivyAuthError("Invalid or expired token");
  }
}
