import { getSupabaseServer } from "@/lib/supabase";

/**
 * A DISCOVERY layer in front of the existing Work mechanic
 * (agent_work_commitments, 0025_auevo_work_github_pr.sql) — this module
 * never writes a commitment itself. It just answers "what could an
 * agent pick up": open, label:"good first issue"/"help wanted" issues
 * across public GitHub generally, via GitHub's public Search API
 * (https://api.github.com/search/issues), synced into the
 * auevo_work_issues cache by syncWorkBoard (run by
 * src/app/api/cron/auevo-work-board-sync). Never fetched live on page
 * load — same convention as fetchPolymarketMarkets/syncPolymarketMarkets
 * in src/lib/auevo/polymarket.ts.
 *
 * Query syntax note: this session's own sandbox cannot live-curl
 * api.github.com/search/* to empirically confirm GitHub's label-OR
 * syntax (its egress proxy categorically refuses non-repo-scoped GitHub
 * API paths before any auth/rate-limit check runs — confirmed with a
 * direct probe, independent of credentials, from both the building and
 * the reviewing session). Rather than rely on an unverified comma-OR
 * reading of one label: clause, fetchOpenIssues runs one query PER
 * label (each unambiguous — a single label: clause has only one
 * possible reading) and merges/dedupes the results by id. Costs one
 * extra Search API call per sync; still just one sync per cron tick,
 * never per page load.
 */

const SEARCH_BASE = "https://api.github.com/search/issues";
const LABELS = ["good first issue", "help wanted"];
const PER_PAGE = 30;
const FETCH_TIMEOUT_MS = 10_000;

export interface WorkIssue {
  id: string; // GitHub's own global issue id (not the per-repo `number`)
  repo: string; // "owner/name"
  issueNumber: number;
  title: string;
  labels: string[];
  htmlUrl: string;
  updatedAt: string;
}

interface RawGithubIssue {
  id?: number;
  number?: number;
  title?: string;
  html_url?: string;
  updated_at?: string;
  pull_request?: unknown; // present on PRs — defensive filter even though is:issue should already exclude these
  labels?: ({ name?: string } | string)[];
  repository_url?: string; // e.g. "https://api.github.com/repos/owner/name"
}

interface GithubSearchResponse {
  items?: RawGithubIssue[];
  message?: string; // present on an error / rate-limit response
}

/**
 * Same GITHUB_TOKEN convention as src/lib/social/verify-work.ts: used
 * when present (raises the rate limit and avoids the stricter
 * unauthenticated search quota), never required — no token means a
 * smaller/slower board, never a hard error.
 */
function githubHeaders(): HeadersInit {
  const headers: HeadersInit = { Accept: "application/vnd.github+json" };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function repoFromRepositoryUrl(url: string | undefined): string | null {
  if (!url) return null;
  const m = /\/repos\/([^/]+\/[^/]+)$/.exec(url);
  return m ? m[1] : null;
}

function normalize(raw: RawGithubIssue): WorkIssue | null {
  if (raw.pull_request) return null;
  const repo = repoFromRepositoryUrl(raw.repository_url);
  if (!repo || !raw.id || !raw.number || !raw.title || !raw.html_url || !raw.updated_at) return null;
  const labels = (raw.labels ?? [])
    .map((l) => (typeof l === "string" ? l : l.name))
    .filter((n): n is string => !!n);
  return {
    id: String(raw.id),
    repo,
    issueNumber: raw.number,
    title: raw.title,
    labels,
    htmlUrl: raw.html_url,
    updatedAt: raw.updated_at,
  };
}

/** One Search API call for a single, unambiguous label: clause. Returns [] on any failure (rate limit, network error, GitHub outage) rather than throwing, so a bad fetch just contributes nothing to this sync instead of erroring the whole cron — same convention as fetchGamma in polymarket.ts. */
async function fetchIssuesForLabel(label: string): Promise<RawGithubIssue[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const query = `label:"${label}" is:issue is:public state:open`;
    const url = `${SEARCH_BASE}?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=${PER_PAGE}`;
    const res = await fetch(url, { headers: githubHeaders(), signal: controller.signal });
    if (!res.ok) return [];
    const json = (await res.json()) as GithubSearchResponse;
    return Array.isArray(json.items) ? json.items : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One Search API call per label (never per-repo, never per page load),
 * merged and deduped by issue id — see the module comment for why this
 * replaced a single comma-OR query.
 */
export async function fetchOpenIssues(): Promise<WorkIssue[]> {
  const perLabel = await Promise.all(LABELS.map(fetchIssuesForLabel));
  const byId = new Map<string, WorkIssue>();
  for (const raws of perLabel) {
    for (const raw of raws) {
      const issue = normalize(raw);
      if (issue && !byId.has(issue.id)) byId.set(issue.id, issue);
    }
  }
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, PER_PAGE);
}

export interface WorkBoardSyncResult {
  fetched: number;
  upserted: number;
}

/** Called by src/app/api/cron/auevo-work-board-sync, periodically. Upserts the current fetchOpenIssues() result into auevo_work_issues; an empty fetch (rate-limited or GitHub down) just leaves the existing cache as-is. */
export async function syncWorkBoard(): Promise<WorkBoardSyncResult> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");

  const issues = await fetchOpenIssues();
  let upserted = 0;
  if (issues.length > 0) {
    const rows = issues.map((i) => ({
      id: i.id,
      repo: i.repo,
      issue_number: i.issueNumber,
      title: i.title,
      labels: i.labels,
      html_url: i.htmlUrl,
      updated_at: i.updatedAt,
      synced_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("auevo_work_issues").upsert(rows, { onConflict: "id" });
    if (error) throw error;
    upserted = rows.length;
  }
  return { fetched: issues.length, upserted };
}
