/**
 * Thin server-only fetch wrapper around LI.FI's REST API — RWA_SPEC.md
 * Phase 4's "серверный прокси /api/lifi/* (ключ и integrator на сервере)".
 *
 * li.quest is blocked from this sandbox's egress proxy (confirmed via
 * repeated direct curl attempts — see AGENTS.md-adjacent session notes),
 * so its request/response shapes here are taken from the officially
 * published `@lifi/types` package (zero runtime deps, pure TypeScript,
 * fetched from the npm registry which IS reachable) rather than from the
 * live docs site. The base URL and the `x-lifi-api-key` header name below
 * are additionally cross-checked against `@lifi/sdk`'s own bundled
 * `dist/cjs/client/createClient.js` (`apiUrl: "https://li.quest/v1"`) and
 * `dist/cjs/utils/request.js` (`if (apiKey) headers["x-lifi-api-key"] = apiKey`)
 * — both read directly out of the npm-published SDK tarball, not secondhand.
 *
 * Deliberately NOT the full `@lifi/sdk` runtime: that package pulls in an
 * execution/task-pipeline layer (wallet signing, retries, chain-switching)
 * this app doesn't want — execution stays on wagmi/viem exactly as Phase 2
 * established, with this module only ever building/relaying plain JSON.
 */

/**
 * Overridable via LIFI_API_URL — same env-override pattern as this app's
 * other external-API wrappers (BLOCKSCOUT_API_URL, GOPLUS_API_URL,
 * XSTOCKS_TOKENLIST_URL): lets tests point this at a local scripted
 * server instead of the real, sandbox-blocked li.quest.
 */
function lifiApiBase(): string {
  return process.env.LIFI_API_URL?.trim() || "https://li.quest/v1";
}

export class LifiApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`LI.FI API error ${status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
    this.name = "LifiApiError";
    this.status = status;
    this.body = body;
  }

  /**
   * A sentence worth putting in front of a person — LI.FI's own error
   * bodies are usually `{ message, code }` with a real, readable sentence
   * already in `message` (e.g. "Token ... is invalid or in deny list.");
   * this app's `.message` above wraps that in "LI.FI API error 400: {...}"
   * for logs, which is the wrong thing to show on a page (a real
   * production case: the raw JSON blob, code and all, rendered directly
   * in the swap form's error banner).
   */
  get userMessage(): string {
    const body = this.body;
    if (body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string") {
      return (body as { message: string }).message;
    }
    return "LI.FI couldn't process this request";
  }
}

export interface LifiFetchOptions {
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Override for tests — defaults to LIFI_API_BASE. */
  baseUrl?: string;
}

function toQueryString(query: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * `path` is the part after `/v1`, e.g. `/advanced/routes`, `/status`.
 * Throws LifiApiError on a non-2xx response rather than returning it, so
 * every call site gets one consistent error shape to catch.
 */
export async function lifiFetch<T>(path: string, options: LifiFetchOptions = {}): Promise<T> {
  const base = options.baseUrl ?? lifiApiBase();
  const url = `${base}${path}${options.query ? toQueryString(options.query) : ""}`;

  const headers: Record<string, string> = { accept: "application/json" };
  const apiKey = process.env.LIFI_API_KEY;
  if (apiKey) headers["x-lifi-api-key"] = apiKey;
  if (options.body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) throw new LifiApiError(res.status, data ?? text);
  return data as T;
}

/**
 * Auevo's own LI.FI integrator identifier — sent on every routes/quote
 * request per RWA_SPEC.md Phase 4 ("integrator=auevo"). Constant, not
 * env-configurable: it identifies this app to LI.FI, not a deployment
 * detail.
 */
export const LIFI_INTEGRATOR = "auevo";

/**
 * Fraction (0..1) form of AUEVO_FEE_BPS for LI.FI's `RouteOptionsBase.fee`
 * field ("0.03 = take 3% integrator fee (requires verified integrator to
 * be set)" — @lifi/types' own doc comment on that field). Returns
 * undefined when unset/zero so the field is simply omitted rather than
 * sent as 0, and — same posture as this app's Jupiter referral fee
 * (.env.example) — sending a nonzero value here does not by itself mean
 * Auevo collects anything: LI.FI only pays an integrator fee out to an
 * integrator LI.FI has verified and registered a payout agreement with,
 * which this project has not done. Left in per the spec's literal
 * instruction; documented honestly rather than silently dropped.
 */
export function lifiFeeFraction(): number | undefined {
  const bps = Number(process.env.AUEVO_FEE_BPS ?? "0");
  if (!Number.isFinite(bps) || bps <= 0) return undefined;
  return bps / 10_000;
}
