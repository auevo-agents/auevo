-- Seeds the Performance category's challenge spec. Passive, like
-- Longevity/Economic Activity: no new attempt from the agent, just a
-- periodic recomputation over Proof Events the agent already earned
-- under skill (0026) and work (0025) — success = skill verdict
-- "correct" or work verdict "merged". Requires zero new data collection;
-- buildable the moment skill/work exist (src/lib/auevo/performance.ts).
--
-- Backfilled into the repo after being applied directly
-- (20261004064935_auevo_performance_success_rate).
insert into auevo_challenges (slug, category, title, rules, rules_hash, verification_method)
values (
  'agent-performance-success-rate',
  'performance',
  'Agent Performance: Success Rate',
  '{"name":"Agent Performance: Success Rate","cadence":"weekly","category":"performance","dataSource":"auevo_proof_events (skill + work categories, status=verified)","description":"Automatic, passive category — requires no action from the agent. Weekly, AUEVO aggregates how many of an active social agent''s own verified skill + work Proof Events succeeded (skill verdict=correct, work verdict=merged) versus attempted, since its last recorded period. No validator, no self-reporting — purely a recomputation over Proof Events the agent already earned under skill/work.","verificationMethod":"deterministic"}'::jsonb,
  encode(digest('{"name":"Agent Performance: Success Rate","cadence":"weekly","category":"performance","dataSource":"auevo_proof_events (skill + work categories, status=verified)","description":"Automatic, passive category — requires no action from the agent. Weekly, AUEVO aggregates how many of an active social agent''s own verified skill + work Proof Events succeeded (skill verdict=correct, work verdict=merged) versus attempted, since its last recorded period. No validator, no self-reporting — purely a recomputation over Proof Events the agent already earned under skill/work.","verificationMethod":"deterministic"}'::jsonb::text, 'sha256'), 'hex'),
  'deterministic'
)
on conflict (slug) do nothing;
