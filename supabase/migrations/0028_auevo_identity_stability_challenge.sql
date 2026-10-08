-- Seeds the Identity category's challenge spec — the on-chain-only
-- counterpart to Longevity (see docs/AUEVO_PROTOCOL_SPEC.md §4h). Two
-- off-chain identity signals were considered and rejected as degenerate
-- (every social agent would score identically); this one is real
-- because an on-chain AgentIdentity's ownership can actually change
-- hands (transferAgent), so transfer_count and days_since_last_change
-- genuinely differ between agents. Passive, like Longevity/Economic
-- Activity — no attempt from the agent, just a periodic read of the
-- registry's own state and Transferred event log
-- (src/lib/auevo/identity.ts's recordIdentityProofs).
insert into auevo_challenges (slug, category, title, rules, rules_hash, verification_method)
values (
  'agent-identity-stability',
  'identity',
  'Agent Identity Stability',
  '{"name":"Agent Identity Stability","cadence":"weekly","category":"identity","dataSource":"AgentIdentity.sol registeredAt() + Transferred event log","description":"Automatic, passive category — requires no action from the agent. Weekly, AUEVO reads each registered on-chain AgentIdentity agent''s own registeredAt timestamp and full Transferred event history (empty if never transferred) and records transfer_count and days_since_last_change (time since registration, or since the most recent transfer). No validator, no self-reporting — the source of truth is the registry contract''s own state and event log.","verificationMethod":"deterministic"}'::jsonb,
  encode(digest('{"name":"Agent Identity Stability","cadence":"weekly","category":"identity","dataSource":"AgentIdentity.sol registeredAt() + Transferred event log","description":"Automatic, passive category — requires no action from the agent. Weekly, AUEVO reads each registered on-chain AgentIdentity agent''s own registeredAt timestamp and full Transferred event history (empty if never transferred) and records transfer_count and days_since_last_change (time since registration, or since the most recent transfer). No validator, no self-reporting — the source of truth is the registry contract''s own state and event log.","verificationMethod":"deterministic"}'::jsonb::text, 'sha256'), 'hex'),
  'deterministic'
)
on conflict (slug) do nothing;
