-- Own on-chain indexer for Robinhood Chain: every Uniswap V3 pool
-- (discovered from the factory's PoolCreated events) and every Swap
-- event across all of them, scanned incrementally by
-- src/app/api/cron/index-chain/route.ts. This replaces the "whatever
-- GeckoTerminal's free API happened to return in this window" data
-- Smart Money ran on before — continuous, complete history instead of a
-- snapshot, once this has had time to catch up.
--
-- Not applied automatically. Run this against the Supabase project
-- backing SUPABASE_URL for this app (Settings -> Database -> SQL
-- Editor, or `supabase db push` with the CLI).

create table if not exists indexer_pools (
  pool_address text primary key,
  token0 text not null,
  token1 text not null,
  fee integer not null,
  created_block bigint not null,
  discovered_at timestamptz not null default now()
);

create table if not exists indexer_swaps (
  id bigserial primary key,
  pool_address text not null,
  sender text not null,
  recipient text not null,
  -- signed int256 in the Swap event — numeric, not bigint, since a
  -- 18-decimal token's raw amount can exceed bigint's ~9.2e18 range.
  amount0 numeric not null,
  amount1 numeric not null,
  sqrt_price_x96 numeric not null,
  tick integer not null,
  block_number bigint not null,
  -- Nullable: resolved from a best-effort eth_getBlockByNumber call per
  -- unique block in the scanned chunk; a failed lookup leaves this null
  -- rather than dropping the swap.
  block_timestamp timestamptz,
  tx_hash text not null,
  log_index integer not null,
  inserted_at timestamptz not null default now(),
  unique (tx_hash, log_index)
);

create index if not exists indexer_swaps_pool_idx on indexer_swaps (pool_address);
create index if not exists indexer_swaps_sender_idx on indexer_swaps (sender);
create index if not exists indexer_swaps_recipient_idx on indexer_swaps (recipient);
create index if not exists indexer_swaps_block_idx on indexer_swaps (block_number);

-- Single-row checkpoint: how far each of the two scans (pool discovery,
-- swap scanning) has gotten. Two separate cursors because a swap can be
-- scanned and stored before its pool is discovered — they're joined at
-- query time, not required to complete in lockstep.
create table if not exists indexer_state (
  id smallint primary key default 1,
  pools_synced_to_block bigint not null default 0,
  swaps_synced_to_block bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint indexer_state_singleton check (id = 1)
);

insert into indexer_state (id) values (1) on conflict (id) do nothing;

-- Same posture as the existing scans/subscribers tables: RLS enabled,
-- no policies — locked to the service role (which bypasses RLS) only.
-- Nothing here is ever read through the public anon key.
alter table indexer_pools enable row level security;
alter table indexer_swaps enable row level security;
alter table indexer_state enable row level security;
