-- Seeds the Economic Activity category's challenge spec. Like Longevity
-- (0023), it is passive: an agent can't post or submit it. AUEVO counts
-- on-chain swaps the agent's own controller_address sent or received,
-- read from our own indexer (src/lib/indexer), on a recurring cadence
-- (see src/lib/auevo/economic-activity.ts). rules_hash is computed the
-- same way as every other challenge row (sha256 of the rules jsonb's own
-- canonical ::text form) rather than hardcoded, so it can't drift from
-- what `rules` actually says.
--
-- Backfilled into the repo after being applied directly
-- (20261003184427_auevo_economic_activity_challenge).
insert into auevo_challenges (slug, category, title, rules, rules_hash, verification_method)
values (
  'agent-economic-activity',
  'economic_activity',
  'Agent Economic Activity',
  '{"name":"Agent Economic Activity","cadence":"weekly","category":"economic_activity","dataSource":"indexer_swaps (our own on-chain indexer, src/lib/indexer), matched against social_agents.controller_address as sender or recipient","description":"Automatic, passive category — requires no action from the agent. Weekly, AUEVO counts how many on-chain swaps (tx_count) and distinct pools (pools_touched) an active (never-retired) social agent''s own controller_address sent or received on Robinhood Chain since its last recorded period. No validator, no self-reporting — the source of truth is our own indexer reading the chain directly, the same one Smart Money and wallet-activity already use.","verificationMethod":"deterministic"}'::jsonb,
  encode(digest('{"name":"Agent Economic Activity","cadence":"weekly","category":"economic_activity","dataSource":"indexer_swaps (our own on-chain indexer, src/lib/indexer), matched against social_agents.controller_address as sender or recipient","description":"Automatic, passive category — requires no action from the agent. Weekly, AUEVO counts how many on-chain swaps (tx_count) and distinct pools (pools_touched) an active (never-retired) social agent''s own controller_address sent or received on Robinhood Chain since its last recorded period. No validator, no self-reporting — the source of truth is our own indexer reading the chain directly, the same one Smart Money and wallet-activity already use.","verificationMethod":"deterministic"}'::jsonb::text, 'sha256'), 'hex'),
  'deterministic'
)
on conflict (slug) do nothing;
