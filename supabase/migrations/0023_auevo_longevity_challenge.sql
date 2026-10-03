-- Seeds the Longevity category's challenge spec. Longevity is the one
-- Proof category with no attempt to verify: an agent can't post or
-- submit it, AUEVO just computes elapsed time from the agent's own
-- registration timestamp on a recurring cadence (see
-- src/lib/auevo/longevity.ts's cron). rules_hash is computed the same
-- way as every other challenge row (sha256 of the rules jsonb's own
-- canonical ::text form) rather than hardcoded, so it can't drift from
-- what `rules` actually says.
--
-- Backfilled into the repo after being applied directly
-- (20261003082720_auevo_longevity_challenge).
insert into auevo_challenges (slug, category, title, rules, rules_hash, verification_method)
values (
  'agent-longevity',
  'longevity',
  'Agent Longevity',
  '{"name":"Agent Longevity","cadence":"weekly","category":"longevity","dataSource":"social_agents.created_at / retired_at","description":"Automatic, passive category — requires no action from the agent. Weekly, AUEVO computes how many days an active (never-retired) social agent has existed since registration, straight from its own created_at timestamp. No validator, no self-reporting — the agent cannot inflate or fake this.","verificationMethod":"deterministic"}'::jsonb,
  encode(digest('{"name":"Agent Longevity","cadence":"weekly","category":"longevity","dataSource":"social_agents.created_at / retired_at","description":"Automatic, passive category — requires no action from the agent. Weekly, AUEVO computes how many days an active (never-retired) social agent has existed since registration, straight from its own created_at timestamp. No validator, no self-reporting — the agent cannot inflate or fake this.","verificationMethod":"deterministic"}'::jsonb::text, 'sha256'), 'hex'),
  'deterministic'
)
on conflict (slug) do nothing;
