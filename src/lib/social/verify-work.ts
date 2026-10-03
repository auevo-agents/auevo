import { getSupabaseServer } from "@/lib/supabase";
import { getProofEventByTaskId, updateProofEvent } from "@/lib/auevo/db";

const BATCH_SIZE = 100;

interface PendingWork {
  post_id: string;
  repo: string;
  pr_number: number;
}

interface GithubPullResponse {
  merged?: boolean;
  merged_at?: string | null;
  message?: string; // present on a 404 ("Not Found")
}

function githubHeaders(): HeadersInit {
  const headers: HeadersInit = { Accept: "application/vnd.github+json" };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Checked rather than thrown: GitHub rate-limiting or a transient network error must never fail the whole pass — that commitment just gets retried next run. */
async function fetchPullState(repo: string, prNumber: number): Promise<{ ok: true; merged: boolean; mergedAt: string | null } | { ok: false; notFound: boolean }> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}`, { headers: githubHeaders() });
    if (res.status === 404) return { ok: false, notFound: true };
    if (!res.ok) return { ok: false, notFound: false };
    const data = (await res.json()) as GithubPullResponse;
    return { ok: true, merged: data.merged === true, mergedAt: data.merged_at ?? null };
  } catch {
    return { ok: false, notFound: false };
  }
}

async function mirrorVerdictToProofEvent(postId: string, status: "verified" | "disputed", resultPatch: Record<string, unknown>): Promise<void> {
  try {
    const proof = await getProofEventByTaskId(postId);
    if (!proof) return;
    await updateProofEvent(proof.id, {
      status,
      endAt: new Date().toISOString(),
      result: { ...proof.result, ...resultPatch },
    });
  } catch (err) {
    console.error("Failed to mirror work verdict to AUEVO Proof Event", postId, err);
  }
}

/**
 * Checks every pending Work commitment against GitHub's own public PR
 * state — not only past-deadline ones, so a PR that merges early gets
 * credited immediately rather than waiting. Only a commitment whose
 * deadline has already passed with no merge gets written as
 * `not_merged` (still `status: "verified"` — a deterministically
 * confirmed miss, same convention verify-claims.ts uses for an
 * "incorrect" prediction); everything else before its deadline is left
 * pending for the next run. A repo/PR that genuinely doesn't exist
 * (GitHub 404) is written `unverifiable` immediately rather than kept
 * pending forever — a transient GitHub error is not, and is simply
 * retried next run.
 */
export async function verifyDueWork(): Promise<{ checked: number; merged: number; notMerged: number; unverifiable: number }> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");

  const { data: due, error } = await supabase
    .from("agent_work_commitments")
    .select("post_id, repo, pr_number, deadline")
    .eq("verdict", "pending")
    .limit(BATCH_SIZE);
  if (error) throw error;

  const commitments = (due ?? []) as (PendingWork & { deadline: string })[];
  const now = Date.now();
  let merged = 0;
  let notMerged = 0;
  let unverifiable = 0;

  for (const c of commitments) {
    const result = await fetchPullState(c.repo, c.pr_number);

    if (result.ok && result.merged) {
      merged++;
      await supabase
        .from("agent_work_commitments")
        .update({ verdict: "merged", merged_at: result.mergedAt, verified_at: new Date().toISOString() })
        .eq("post_id", c.post_id);
      await mirrorVerdictToProofEvent(c.post_id, "verified", { verdict: "merged", merged_at: result.mergedAt });
      continue;
    }

    if (!result.ok && result.notFound) {
      unverifiable++;
      await supabase.from("agent_work_commitments").update({ verdict: "unverifiable", verified_at: new Date().toISOString() }).eq("post_id", c.post_id);
      await mirrorVerdictToProofEvent(c.post_id, "disputed", { verdict: "unverifiable" });
      continue;
    }

    const deadlinePassed = new Date(c.deadline).getTime() <= now;
    if (!result.ok || !deadlinePassed) continue; // not yet due, or a transient GitHub error — retry next run

    notMerged++;
    await supabase.from("agent_work_commitments").update({ verdict: "not_merged", verified_at: new Date().toISOString() }).eq("post_id", c.post_id);
    await mirrorVerdictToProofEvent(c.post_id, "verified", { verdict: "not_merged" });
  }

  return { checked: commitments.length, merged, notMerged, unverifiable };
}
