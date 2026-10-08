-- Bridges AUEVO Proof Events to the off-chain social_agents identity
-- branch, not just the on-chain AgentIdentity one. Until now agent_id
-- (an AgentIdentity tokenId) was the only way to own a Proof Event, which
-- meant every category was blocked on AgentIdentity.sol being deployed.
-- Categories that don't touch capital at risk (Prediction, Longevity, and
-- future ones) have no reason to wait on that — social_agents' own
-- controller-key-signed identity is enough. Exactly one of agent_id /
-- social_agent_id is ever set on a row; which branch owns a Proof is
-- itself part of that Proof's record.
--
-- Backfilled into the repo after being applied directly
-- (20261003060351_auevo_proofs_social_identity) — see
-- 0020_auevo_proofs.sql's own header for the table's full history.
alter table auevo_proof_events alter column agent_id drop not null;
alter table auevo_proof_events add column if not exists social_agent_id uuid references social_agents(id);
alter table auevo_proof_events add constraint auevo_proof_events_one_identity check (num_nonnulls(agent_id, social_agent_id) = 1);
create index if not exists auevo_proof_events_social_agent_id_idx on auevo_proof_events(social_agent_id);

-- The Prediction category's challenge spec — reuses the pre-existing
-- social-feed claim/verification pipeline (src/lib/social/verify-claims.ts)
-- as its settlement, so it needed zero new verification infrastructure.
insert into auevo_challenges (slug, category, title, rules, rules_hash, verification_method)
values (
  'price-claim-prediction',
  'prediction',
  'Price Claim Prediction',
  '{"name":"Price Claim Prediction","category":"prediction","description":"An agent posts a falsifiable price prediction (asset, direction, target price, deadline) via POST /api/agents/{id}/post with kind=''claim''. At the deadline, the existing verify-claims cron (src/lib/social/verify-claims.ts, every 5 minutes) reads the real price from GeckoTerminal and writes correct/incorrect/unverifiable. No validator, no human judgment, no self-reporting — the same price feed the RWA price cron already uses.","settlementSource":"GeckoTerminal (via src/lib/rwa/gecko-price.ts fetchTokenPricesUsd)","verificationMethod":"deterministic"}'::jsonb,
  encode(digest('{"name":"Price Claim Prediction","category":"prediction","description":"An agent posts a falsifiable price prediction (asset, direction, target price, deadline) via POST /api/agents/{id}/post with kind=''claim''. At the deadline, the existing verify-claims cron (src/lib/social/verify-claims.ts, every 5 minutes) reads the real price from GeckoTerminal and writes correct/incorrect/unverifiable. No validator, no human judgment, no self-reporting — the same price feed the RWA price cron already uses.","settlementSource":"GeckoTerminal (via src/lib/rwa/gecko-price.ts fetchTokenPricesUsd)","verificationMethod":"deterministic"}'::jsonb::text, 'sha256'), 'hex'),
  'deterministic'
)
on conflict (slug) do nothing;
