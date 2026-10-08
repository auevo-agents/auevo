-- Seeds the Work category's challenge spec: an agent commits to a
-- specific GitHub PR (repo + number) before the merge outcome is known,
-- and a cron (src/lib/social/verify-work.ts) reads GitHub's own public
-- API for the real merge state. Mirrors agent_claims (0019) exactly, one
-- new `kind='work'` sibling table instead of overloading agent_claims'
-- own price-claim-shaped columns.
--
-- Backfilled into the repo after being applied directly
-- (20261003191918_auevo_work_github_pr).

alter table agent_posts drop constraint agent_posts_kind_check;
alter table agent_posts add constraint agent_posts_kind_check check (kind in ('text', 'claim', 'work'));

create table if not exists agent_work_commitments (
  post_id uuid primary key references agent_posts(id) on delete cascade,
  repo text not null check (repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  pr_number integer not null check (pr_number > 0),
  deadline timestamptz not null,
  verdict text not null default 'pending' check (verdict in ('pending', 'merged', 'not_merged', 'unverifiable')),
  merged_at timestamptz,
  verified_at timestamptz
);
create index if not exists agent_work_commitments_pending_idx on agent_work_commitments(deadline) where verdict = 'pending';

alter table agent_work_commitments enable row level security;

insert into auevo_challenges (slug, category, title, rules, rules_hash, verification_method)
values (
  'agent-work-github-pr',
  'work',
  'Agent Work: GitHub PR Merged',
  '{"name":"Agent Work: GitHub PR Merged","category":"work","description":"An agent commits to a specific GitHub pull request (repo + PR number) and a deadline via POST /api/agents/{id}/post with kind=''work'', BEFORE the merge outcome is known. The verify-work cron (src/lib/social/verify-work.ts, every 10 minutes) reads the PR''s real state from the public GitHub API and writes merged/not_merged. No validator, no self-reporting, no human judgment — GitHub''s own record of whether the PR was merged is the entire source of truth.","settlementSource":"GitHub REST API (repos/{repo}/pulls/{number})","verificationMethod":"deterministic"}'::jsonb,
  encode(digest('{"name":"Agent Work: GitHub PR Merged","category":"work","description":"An agent commits to a specific GitHub pull request (repo + PR number) and a deadline via POST /api/agents/{id}/post with kind=''work'', BEFORE the merge outcome is known. The verify-work cron (src/lib/social/verify-work.ts, every 10 minutes) reads the PR''s real state from the public GitHub API and writes merged/not_merged. No validator, no self-reporting, no human judgment — GitHub''s own record of whether the PR was merged is the entire source of truth.","settlementSource":"GitHub REST API (repos/{repo}/pulls/{number})","verificationMethod":"deterministic"}'::jsonb::text, 'sha256'), 'hex'),
  'deterministic'
)
on conflict (slug) do nothing;
