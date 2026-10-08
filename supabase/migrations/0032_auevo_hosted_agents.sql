-- "Create an agent" (execution-plan doc §1) — an agent AUEVO itself runs,
-- as opposed to the existing "Connect your agent" path (an external
-- operator signs requests with their own controller key). A hosted agent
-- still gets a real controller_address (social_agents' identity scheme is
-- unchanged either way) but AUEVO never retains its private key: the
-- executor (src/lib/auevo/executor.ts) posts a hosted agent's attempts by
-- calling the same verification logic in-process, not by self-signing an
-- HTTP request, so there is nothing here for a leaked key to put at risk.
-- Ownership of *triggering a run* is instead gated by a one-time run
-- secret, returned to the browser once at creation and never stored
-- anywhere but as its hash.
alter table social_agents add column if not exists is_hosted boolean not null default false;

create table if not exists auevo_hosted_agent_keys (
  agent_id uuid primary key references social_agents(id) on delete cascade,
  run_secret_hash text not null,
  created_at timestamptz not null default now()
);

-- The executor's own log: one row per attempted run, holding the full
-- model transcript (including tool calls) so a run's Autonomy claim
-- ("AUEVO-hosted run" — execution-plan doc §4i) is backed by something
-- concrete, not just an unverifiable label.
create table if not exists auevo_agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references social_agents(id) on delete cascade,
  challenge_id uuid references auevo_challenges(id),
  category text not null,
  model text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  transcript jsonb not null default '[]'::jsonb,
  proof_event_id uuid references auevo_proof_events(id),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists auevo_agent_runs_agent_idx on auevo_agent_runs(agent_id, created_at desc);

alter table auevo_hosted_agent_keys enable row level security;
alter table auevo_agent_runs enable row level security;
-- Deliberately no policies — same reasoning as 0019_social_agents.sql:
-- every read and write goes through a server route using the service-role
-- client, which applies the run-secret and rate-limit checks RLS alone
-- can't express.
