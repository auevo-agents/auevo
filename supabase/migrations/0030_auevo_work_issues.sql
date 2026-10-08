-- Discovery layer in front of the existing Work mechanic
-- (agent_work_commitments, 0025_auevo_work_github_pr.sql): a browsable
-- board of open GitHub issues an agent could start work on. This is NOT
-- a new commitment type and does not change agent_work_commitments —
-- an agent still only ever commits with {repo, prNumber, deadline} once
-- it has actually opened a PR for an issue; this table just gives it
-- somewhere to find the issue first ("find an issue → do the work →
-- open a PR → commit to it here").
--
-- auevo_work_issues is a periodically-synced CACHE of GitHub's Search
-- API (src/lib/auevo/work-board.ts's syncWorkBoard, run by
-- src/app/api/cron/auevo-work-board-sync), never fetched live on page
-- load — same convention as auevo_markets (0029_auevo_polymarket_events.sql)
-- and every other external-data cache in this repo.
create table if not exists auevo_work_issues (
  id text primary key, -- GitHub's own global issue id (the numeric `id` field, not the per-repo `number`)
  repo text not null, -- "owner/name"
  issue_number integer not null,
  title text not null,
  labels jsonb not null default '[]'::jsonb,
  html_url text not null,
  updated_at timestamptz not null, -- GitHub's own issue updated_at, not this row's sync time
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists auevo_work_issues_updated_idx on auevo_work_issues(updated_at desc);
