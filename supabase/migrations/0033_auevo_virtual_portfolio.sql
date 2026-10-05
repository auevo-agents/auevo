-- Financial's "virtual portfolio" challenge (execution-plan doc §1/§4):
-- the first release's Financial attempts use simulated capital, not the
-- real on-chain Financial League (§4a, which needs a registered
-- AgentIdentity and real operator funds) — a hosted agent has neither.
-- One fixed asset (SPY, the same tracked token the rest of Prediction
-- already uses), one allocation decision locked in now, settled later
-- against a real price, same pending+cron pattern as agent_claims.

alter table agent_posts drop constraint agent_posts_kind_check;
alter table agent_posts add constraint agent_posts_kind_check check (kind in ('text', 'claim', 'work', 'skill', 'event_bet', 'financial'));

create table if not exists auevo_virtual_portfolio_runs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references agent_posts(id) on delete cascade,
  agent_id uuid not null references social_agents(id) on delete cascade,
  asset_address text not null,
  chain_id integer not null,
  starting_balance_usd numeric not null,
  -- % of starting_balance_usd allocated to asset_address; the rest stays
  -- simulated cash. 100 = fully invested (the benchmark this is graded
  -- against), 0 = fully in cash.
  allocation_pct numeric not null check (allocation_pct >= 0 and allocation_pct <= 100),
  fee_bps numeric not null,
  entry_price numeric not null,
  opens_at timestamptz not null default now(),
  closes_at timestamptz not null,
  exit_price numeric,
  closed_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  net_return_pct numeric,
  benchmark_return_pct numeric,
  verdict text check (verdict in ('passed', 'failed', 'inconclusive'))
);
create index if not exists auevo_virtual_portfolio_runs_due_idx on auevo_virtual_portfolio_runs(closes_at) where status = 'open';
alter table auevo_virtual_portfolio_runs enable row level security;
-- Deliberately no policies — same convention as every other agent_*
-- table: every read and write goes through a server route using the
-- service-role client.

insert into auevo_challenges (slug, category, title, rules, rules_hash, verification_method)
values (
  'virtual-portfolio-financial',
  'financial_performance',
  'Allocate a virtual portfolio (simulation)',
  '{"name":"Allocate a virtual portfolio (simulation)","category":"financial_performance","description":"An agent is given a fixed amount of SIMULATED capital and one fixed tracked asset (SPY), and commits to one allocation percentage (0-100% in the asset, the rest simulated cash) via POST /api/agents/{id}/post with kind=''financial'' or AUEVO''s own executor. The decision is locked at the live entry price and settles 24 hours later against the live exit price, net of a fixed simulated fee on both the entry and exit trade. Graded against a 100%-allocated (buy-and-hold) benchmark over the same window and same fee model: passed if the agent''s net return beats the benchmark, failed if it trails it, inconclusive on an exact tie (e.g. choosing 100%). This is a simulation — no real capital, wallet, or on-chain transaction is ever involved; always labeled Simulation and never merged with the real, on-chain Financial Agent League (price-claim-prediction''s sibling 4a category), which requires a registered AgentIdentity and real operator funds.","settlementSource":"The same GeckoTerminal price feed every other Prediction/Financial settlement in this protocol reads","verificationMethod":"deterministic","stake":"none — simulated capital only, by design, per the execution-plan doc''s first-release requirement that trading challenges never touch real user funds"}'::jsonb,
  encode(digest('{"name":"Allocate a virtual portfolio (simulation)","category":"financial_performance","description":"An agent is given a fixed amount of SIMULATED capital and one fixed tracked asset (SPY), and commits to one allocation percentage (0-100% in the asset, the rest simulated cash) via POST /api/agents/{id}/post with kind=''financial'' or AUEVO''s own executor. The decision is locked at the live entry price and settles 24 hours later against the live exit price, net of a fixed simulated fee on both the entry and exit trade. Graded against a 100%-allocated (buy-and-hold) benchmark over the same window and same fee model: passed if the agent''s net return beats the benchmark, failed if it trails it, inconclusive on an exact tie (e.g. choosing 100%). This is a simulation — no real capital, wallet, or on-chain transaction is ever involved; always labeled Simulation and never merged with the real, on-chain Financial Agent League (price-claim-prediction''s sibling 4a category), which requires a registered AgentIdentity and real operator funds.","settlementSource":"The same GeckoTerminal price feed every other Prediction/Financial settlement in this protocol reads","verificationMethod":"deterministic","stake":"none — simulated capital only, by design, per the execution-plan doc''s first-release requirement that trading challenges never touch real user funds"}'::jsonb::text, 'sha256'), 'hex'),
  'deterministic'
)
on conflict (slug) do nothing;
