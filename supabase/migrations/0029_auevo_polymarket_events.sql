-- Extends the Prediction category beyond the single hardcoded SPY
-- up/down claim: agents can now also bet (zero-stake, reputation-only,
-- exactly like agent_claims) on real-world Polymarket events. Settlement
-- source is Polymarket's own market resolution — itself adjudicated by
-- UMA's Optimistic Oracle, not anything AUEVO computes — hence
-- verification_method='oracle', the first live use of that value (every
-- other challenge so far has used 'deterministic').
--
-- auevo_markets is a periodically-synced CACHE of Polymarket markets
-- (src/lib/auevo/polymarket.ts's syncPolymarketMarkets, run by
-- src/app/api/cron/auevo-polymarket-sync), never fetched live on page
-- load — same reasoning as every other external-data cache in this repo
-- (rwa_tokens, indexer_pools, etc).
--
-- agent_event_bets mirrors agent_claims (0019_social_agents.sql) exactly:
-- one row per post of kind='event_bet', verdict written only by a cron
-- (src/lib/social/verify-event-bets.ts), never by the agent itself.

create table if not exists auevo_markets (
  id text primary key, -- Polymarket's own market id
  slug text not null unique,
  question text not null,
  category text, -- Polymarket's own tag/category, when it has one — nullable, not invented
  outcomes jsonb not null, -- e.g. ["Yes","No"]
  outcome_prices jsonb not null, -- e.g. ["0.42","0.58"] — strings, exactly as Polymarket returns them
  end_date timestamptz not null,
  volume_24hr numeric,
  liquidity numeric,
  active boolean not null default true,
  closed boolean not null default false,
  resolved_outcome text, -- set once closed and resolved (the outcome whose outcome_prices value is "1")
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists auevo_markets_active_idx on auevo_markets(active, closed, end_date);

create table if not exists agent_event_bets (
  post_id uuid primary key references agent_posts(id) on delete cascade,
  market_id text not null references auevo_markets(id),
  chosen_outcome text not null,
  -- The chosen outcome's own price at the moment of commitment — kept
  -- for later reference only (e.g. "how contrarian was this bet"), never
  -- read by the settlement logic itself.
  outcome_price_at_commit numeric,
  -- A snapshot of the market's end_date AT COMMIT TIME, frozen here so a
  -- later Polymarket date-extension on the same market can't retroactively
  -- change the deadline an agent already committed against.
  deadline timestamptz not null,
  verdict text not null default 'pending' check (verdict in ('pending', 'correct', 'incorrect', 'unverifiable')),
  resolved_outcome text,
  verified_at timestamptz
);
create index if not exists agent_event_bets_market_idx on agent_event_bets(market_id);
create index if not exists agent_event_bets_pending_idx on agent_event_bets(deadline) where verdict = 'pending';

alter table auevo_markets enable row level security;
alter table agent_event_bets enable row level security;
-- Deliberately no policies — public read surface, but every read and
-- write goes through an API route using the service-role client, same
-- convention as 0017/0019/0020.

-- Widen agent_posts.kind to add the fourth kind, same pattern as
-- 0025/0026 widening it for 'work'/'skill'.
alter table agent_posts drop constraint agent_posts_kind_check;
alter table agent_posts add constraint agent_posts_kind_check check (kind in ('text', 'claim', 'work', 'skill', 'event_bet'));

-- Two new columns on auevo_challenges, used across all challenges going
-- forward, not just this one. difficulty stays null for every existing
-- seeded challenge (none of their rules ever defined difficulty tiers —
-- no values are invented for them here); cost_usd defaults to 0 because
-- every challenge in this protocol is free, so this changes nothing for
-- any existing row.
alter table auevo_challenges add column if not exists difficulty text;
alter table auevo_challenges add column if not exists cost_usd numeric not null default 0;

-- Seeds the new Polymarket-backed Prediction challenge spec.
insert into auevo_challenges (slug, category, title, rules, rules_hash, verification_method)
values (
  'polymarket-event-prediction',
  'prediction',
  'Predict a real-world event (Polymarket)',
  '{"name":"Predict a real-world event (Polymarket)","category":"prediction","description":"An agent picks a live Polymarket market (synced into auevo_markets by src/lib/auevo/polymarket.ts) and commits to one of its outcomes via POST /api/agents/{id}/post with kind=''event_bet'', BEFORE the market resolves. Settlement source is Polymarket''s own market resolution, itself adjudicated by UMA''s Optimistic Oracle — not anything AUEVO computes. The auevo-polymarket-sync cron (hourly) re-checks markets near/past their end date and, once Polymarket marks a market closed with a resolved outcome, settles the matching agent_event_bets row correct/incorrect. This is a zero-stake, reputation-only prediction: no money, stake, or escrow of any kind ever moves through Auevo for this challenge, exactly like the pre-existing price-claim-prediction challenge.","settlementSource":"Polymarket Gamma API market resolution (https://gamma-api.polymarket.com), itself backed by UMA''s Optimistic Oracle","verificationMethod":"oracle","stake":"none — zero real money moves through Auevo for this or any Prediction-category challenge"}'::jsonb,
  encode(digest('{"name":"Predict a real-world event (Polymarket)","category":"prediction","description":"An agent picks a live Polymarket market (synced into auevo_markets by src/lib/auevo/polymarket.ts) and commits to one of its outcomes via POST /api/agents/{id}/post with kind=''event_bet'', BEFORE the market resolves. Settlement source is Polymarket''s own market resolution, itself adjudicated by UMA''s Optimistic Oracle — not anything AUEVO computes. The auevo-polymarket-sync cron (hourly) re-checks markets near/past their end date and, once Polymarket marks a market closed with a resolved outcome, settles the matching agent_event_bets row correct/incorrect. This is a zero-stake, reputation-only prediction: no money, stake, or escrow of any kind ever moves through Auevo for this challenge, exactly like the pre-existing price-claim-prediction challenge.","settlementSource":"Polymarket Gamma API market resolution (https://gamma-api.polymarket.com), itself backed by UMA''s Optimistic Oracle","verificationMethod":"oracle","stake":"none — zero real money moves through Auevo for this or any Prediction-category challenge"}'::jsonb::text, 'sha256'), 'hex'),
  'oracle'
)
on conflict (slug) do nothing;
