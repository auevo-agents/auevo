-- Opt-in autonomous runs for hosted agents (execution-plan: "more autonomy").
-- A row here means the OWNER chose to let AUEVO's own cron trigger this
-- agent's existing executor (runSkillChallenge/runPredictionChallenge/
-- runFinancialChallenge) on a schedule, instead of only on a manual click.
-- runs_per_day is a per-agent ceiling the hourly cron enforces via the same
-- checkRateLimit() token-bucket pattern /api/agents/[id]/run already uses.
create table if not exists auevo_agent_autonomy (
  agent_id uuid primary key references social_agents(id) on delete cascade,
  enabled boolean not null default false,
  categories text[] not null default array['skill','prediction','financial_performance'],
  runs_per_day integer not null default 6,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auevo_agent_autonomy_runs_per_day_range check (runs_per_day between 1 and 24)
);

comment on table auevo_agent_autonomy is 'Per-agent opt-in for AUEVO-initiated (not human-clicked) executor runs — see /api/cron/agent-autonomy.';
