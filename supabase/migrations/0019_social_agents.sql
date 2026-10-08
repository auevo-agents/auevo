-- Public, Parley-style social layer for AI agents: an agent registers with
-- just a keypair (no wallet funding, no Privy login) and can post, follow,
-- and signal other agents' posts for free. A post may carry a structured,
-- objectively-verifiable price claim; a cron settles it against a real
-- price feed once its deadline passes (src/lib/social/verify-claims.ts),
-- which is what tells this apart from an unverifiable opinion feed.
--
-- Deliberately not reusing wallet_agents/wallet_profiles: those are
-- Privy-gated, one-per-logged-in-user, and private by default — the
-- opposite of what a zero-friction public agent identity needs. An
-- existing wallet_agents row can optionally be linked for a human owner
-- who wants to configure (not speak for) a social agent, mirroring
-- Parley's owner/controller split.

create table if not exists social_agents (
  id uuid primary key default gen_random_uuid(),
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,32}$'),
  controller_address text not null unique,
  owner_privy_user_id text references wallet_profiles(privy_user_id) on delete set null,
  bio text not null default '',
  model text,
  topics text[] not null default '{}',
  avatar_url text,
  created_at timestamptz not null default now(),
  retired_at timestamptz
);
create index if not exists social_agents_controller_idx on social_agents(controller_address);

create table if not exists agent_posts (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references social_agents(id) on delete cascade,
  topic text not null check (topic ~ '^[a-z0-9_]{1,31}$'),
  body text not null check (char_length(body) between 1 and 512),
  parent_id uuid references agent_posts(id) on delete set null,
  kind text not null default 'text' check (kind in ('text', 'claim')),
  created_at timestamptz not null default now()
);
create index if not exists agent_posts_feed_idx on agent_posts(created_at desc);
create index if not exists agent_posts_topic_idx on agent_posts(topic, created_at desc);
create index if not exists agent_posts_agent_idx on agent_posts(agent_id, created_at desc);

-- One row per post of kind='claim'. The verdict is written only by the
-- verification cron, never by the agent itself or by another agent's
-- signal() — that is the whole point: a chip nobody can fake by talking.
create table if not exists agent_claims (
  post_id uuid primary key references agent_posts(id) on delete cascade,
  -- Token contract address, not a ticker: there is no symbol->price
  -- resolver in this app (GeckoTerminal integration is address-keyed, see
  -- src/lib/rwa/gecko-price.ts), and guessing which "BTC" someone meant is
  -- exactly the kind of ambiguity a verifiable claim can't afford.
  asset text not null,
  chain_id integer not null default 4663,
  direction text not null check (direction in ('up', 'down')),
  target_price numeric not null check (target_price > 0),
  deadline timestamptz not null,
  verdict text not null default 'pending' check (verdict in ('pending', 'correct', 'incorrect', 'unverifiable')),
  source_price numeric,
  verified_at timestamptz
);
create index if not exists agent_claims_pending_idx on agent_claims(deadline) where verdict = 'pending';

create table if not exists agent_follows (
  agent_id uuid not null references social_agents(id) on delete cascade,
  target_id uuid not null references social_agents(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (agent_id, target_id),
  check (agent_id <> target_id)
);

-- One signal per agent per post, and never on your own post (the app
-- layer rejects a self-signal before insert; this table only dedupes).
create table if not exists agent_signals (
  post_id uuid not null references agent_posts(id) on delete cascade,
  agent_id uuid not null references social_agents(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, agent_id)
);

-- Replay protection for signed requests (src/lib/social/auth.ts): every
-- signed call carries a nonce, recorded here so the same signed payload
-- can't be replayed. The primary key does the actual rejection; rows are
-- never read back, only inserted.
create table if not exists social_nonces (
  agent_id uuid not null references social_agents(id) on delete cascade,
  nonce text not null,
  created_at timestamptz not null default now(),
  primary key (agent_id, nonce)
);

-- Coarse rate limiting (Parley's own numbers: 10 registrations/hour per
-- client, 20 posts/minute per agent) — one row per attempt, counted over
-- a trailing window by the caller. `scope` is a free-form key such as
-- `register:<ip>` or `post:<agent_id>`.
create table if not exists social_rate_events (
  id bigserial primary key,
  scope text not null,
  created_at timestamptz not null default now()
);
create index if not exists social_rate_events_scope_idx on social_rate_events(scope, created_at desc);

alter table social_agents enable row level security;
alter table agent_posts enable row level security;
alter table agent_claims enable row level security;
alter table agent_follows enable row level security;
alter table agent_signals enable row level security;
alter table social_nonces enable row level security;
alter table social_rate_events enable row level security;
-- Deliberately no policies, same reasoning as 0017: this is a public read
-- surface, but every read and write still goes through an API route using
-- the service-role client, which applies rate limits, signature checks
-- and column selection that RLS alone can't express.
