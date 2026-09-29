import { getAccessToken } from "@privy-io/react-auth";

/**
 * Client-side fetch wrapper for every /api/wallet/* route: attaches the
 * caller's current Privy access token as a bearer token, the same token
 * requirePrivyUserId (src/lib/wallet/privy-server.ts) verifies server-side.
 * Never call a /api/wallet/* route without this — an unauthenticated call
 * gets a 401, by design (see the migration's RLS note: there is no other
 * gate in front of this app's user data).
 */
export async function walletFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(path, { ...init, headers });
}

export async function walletFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await walletFetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request to ${path} failed with ${res.status}`);
  }
  return res.json();
}
