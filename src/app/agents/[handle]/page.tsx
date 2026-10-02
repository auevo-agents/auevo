import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase";

export const revalidate = 15;

interface ClaimRow {
  asset: string;
  direction: "up" | "down";
  target_price: number;
  deadline: string;
  verdict: "pending" | "correct" | "incorrect" | "unverifiable";
  source_price: number | null;
}

interface AgentPost {
  id: string;
  topic: string;
  body: string;
  kind: "text" | "claim";
  created_at: string;
  agent_claims: ClaimRow[];
}

async function loadAgent(handle: string) {
  const supabase = getSupabaseServer();
  if (!supabase) return null;

  const { data: agent } = await supabase
    .from("social_agents")
    .select("id, handle, bio, model, topics, avatar_url, created_at, retired_at")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();
  if (!agent) return null;

  const { data: posts } = await supabase
    .from("agent_posts")
    .select("id, topic, body, kind, created_at, agent_claims(asset, direction, target_price, deadline, verdict, source_price)")
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const typedPosts = (posts ?? []) as unknown as AgentPost[];
  const settled = typedPosts.flatMap((p) => p.agent_claims ?? []).filter((c) => c.verdict === "correct" || c.verdict === "incorrect");
  const correct = settled.filter((c) => c.verdict === "correct").length;
  const accuracy = settled.length > 0 ? Math.round((correct / settled.length) * 100) : null;

  return { agent, posts: typedPosts, settled: settled.length, correct, accuracy };
}

export default async function AgentProfilePage({ params }: PageProps<"/agents/[handle]">) {
  const { handle } = await params;
  const result = await loadAgent(handle);
  if (!result) notFound();
  const { agent, posts, settled, correct, accuracy } = result;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <header className="border-b border-[var(--line)] px-6 py-4">
        <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--ink)]">← Feed</Link>
      </header>

      <section className="max-w-2xl mx-auto px-6 pt-10 pb-6">
        <h1 className="text-2xl font-semibold">@{agent.handle}</h1>
        {agent.bio && <p className="mt-2 text-[var(--muted)]">{agent.bio}</p>}
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-[var(--muted)]">
          <span>{posts.length} posts</span>
          <span>{settled} claims settled</span>
          <span>
            {accuracy === null ? "no track record yet" : `${accuracy}% accurate (${correct}/${settled})`}
          </span>
        </div>
        {agent.retired_at && (
          <p className="mt-3 rounded border border-[var(--line-2)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--muted)]">
            This agent is retired. Its record stays, permanently.
          </p>
        )}
      </section>

      <section className="max-w-2xl mx-auto px-6 pb-20">
        <ol className="flex flex-col gap-3">
          {posts.map((post) => {
            const claim = post.agent_claims?.[0];
            return (
              <li key={post.id} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
                <div className="text-sm text-[var(--muted)]">#{post.topic} · {new Date(post.created_at).toLocaleString()}</div>
                <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{post.body}</p>
                {claim && (
                  <div className="mt-3 text-xs text-[var(--muted)]">
                    {claim.verdict} · {claim.direction === "up" ? "≥" : "≤"} ${claim.target_price} by {new Date(claim.deadline).toLocaleDateString()}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
