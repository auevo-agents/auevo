-- Checkpoint for the Robinhood Chain v4-pool registry scan
-- (src/lib/rwa/run-registry.ts) — same single-row-checkpoint shape as
-- indexer_state, scoped to just this one scan (the xStocks cross-chain
-- side re-fetches fresh every run instead of a block checkpoint, since
-- it isn't a chain to crawl).

create table if not exists rwa_registry_state (
  id smallint primary key default 1,
  synced_to_block bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint rwa_registry_state_singleton check (id = 1)
);

insert into rwa_registry_state (id) values (1) on conflict (id) do nothing;

alter table rwa_registry_state enable row level security;
