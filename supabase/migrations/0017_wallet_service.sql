-- AUEVO Wallet service (Privy auth + Claude agent chat).
--
-- Keys are never stored here — Privy owns the user's embedded wallet key,
-- this project only stores app data (profile, agent configs, chat history,
-- activity log), all keyed by privy_user_id (Privy's `did:privy:...` id).
--
-- RLS is enabled with NO policies for anon/authenticated: the anon key can
-- read or write nothing in these tables. Every access goes through a
-- server API route that verifies the caller's Privy auth token, then uses
-- the service-role client (see src/lib/supabase.ts's getSupabaseServer),
-- which bypasses RLS entirely. This mirrors the "server checks the token,
-- then talks to Supabase with service role" pattern already used by the
-- cron routes in this app, applied here to end-user data instead of
-- CRON_SECRET-gated system jobs.

create table if not exists wallet_profiles (
  privy_user_id text primary key,
  email text,
  phone text,
  x_handle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wallet_agents (
  id uuid primary key default gen_random_uuid(),
  privy_user_id text not null references wallet_profiles(privy_user_id) on delete cascade,
  name text not null,
  persona text not null default '',
  avatar_url text,
  model text not null default 'claude-opus-5',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wallet_agents_privy_user_id_idx on wallet_agents(privy_user_id);

create table if not exists wallet_chats (
  id uuid primary key default gen_random_uuid(),
  privy_user_id text not null references wallet_profiles(privy_user_id) on delete cascade,
  agent_id uuid references wallet_agents(id) on delete set null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wallet_chats_privy_user_id_idx on wallet_chats(privy_user_id);

create table if not exists wallet_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references wallet_chats(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists wallet_messages_chat_id_idx on wallet_messages(chat_id, created_at);

-- Read-only audit trail of what the agent was asked / told, and of wallet
-- actions the client reports after they happen on-chain (send/buy/swap
-- estimate) — never a place the agent or an API route can queue a spend
-- from itself, since Phase 1 has no agent-controlled wallet at all.
create table if not exists wallet_activity (
  id uuid primary key default gen_random_uuid(),
  privy_user_id text not null references wallet_profiles(privy_user_id) on delete cascade,
  kind text not null,
  chain_id integer,
  tx_hash text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists wallet_activity_privy_user_id_idx on wallet_activity(privy_user_id, created_at desc);

alter table wallet_profiles enable row level security;
alter table wallet_agents enable row level security;
alter table wallet_chats enable row level security;
alter table wallet_messages enable row level security;
alter table wallet_activity enable row level security;
-- Deliberately no policies: anon/authenticated get zero access by default
-- under RLS. Only the service-role key (used server-side, after verifying
-- the caller's Privy token) can read or write these tables.
