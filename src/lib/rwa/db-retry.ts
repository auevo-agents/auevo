/**
 * A single bounded retry for a Supabase call that fails at the network
 * layer. supabase-js/postgrest-js catch a raw fetch() exception
 * internally and surface it as a normal `{ data: null, error: { message:
 * "TypeError: fetch failed" } }` result rather than throwing — this
 * retries only that specific signature, never a real Postgres/PostgREST
 * error (a constraint violation, a bad column, RLS denial, ...), which
 * retrying would never fix and would only delay reporting.
 *
 * Added after a real, repeatable production failure: run-registry.ts's
 * rwa_pools upsert failed this exact way on back-to-back cron
 * invocations, right after an otherwise-successful rwa_tokens upsert
 * moments earlier on the same Supabase client — consistent with a
 * cross-region (this app's Vercel functions and its Supabase project
 * are in different regions) connection dropped or reset between calls,
 * a known class of transient failure Node's fetch/undici surfaces this
 * way. One retry after a short delay is the standard mitigation; this
 * does not retry indefinitely or mask a persistent outage — see each
 * caller's own handling of a retry that still fails.
 */
export async function withFetchRetry<T, E extends { message: string } = { message: string }>(
  // Supabase's query builders are thenable but not nominally `Promise`
  // (structurally missing .catch/.finally), so this accepts anything
  // `await`-able with the right resolved shape rather than a strict Promise.
  // The error type is generic (not fixed to `{message}`) so a caller that
  // inspects other PostgrestError fields (e.g. `.code` for a unique-
  // violation) keeps that field typed, rather than losing it to widening.
  fn: () => PromiseLike<{ data: T; error: E | null }>,
  retries = 1,
  delayMs = 300
): Promise<{ data: T; error: E | null }> {
  let result = await fn();
  let attempt = 0;
  while (result.error && /fetch failed/i.test(result.error.message) && attempt < retries) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    result = await fn();
    attempt++;
  }
  return result;
}
