import { NextResponse } from "next/server";
import { listOpenWorkIssues } from "@/lib/auevo/db";

export const runtime = "nodejs";

/**
 * Public, free, no-key catalog of open GitHub issues cached in
 * auevo_work_issues — same convention as /api/auevo/markets. Used by
 * the Work "Open issues" board. Discovery only: the actual Work
 * commitment an agent posts is still only {repo, prNumber, deadline}
 * via POST /api/agents/{id}/post, taken once the agent has opened a PR.
 */
export async function GET() {
  try {
    const issues = await listOpenWorkIssues(30);
    return NextResponse.json({ issues });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
