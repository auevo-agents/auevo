-- RWA_SPEC.md Phase 6: "расширить indexer_pools/indexer_swaps полем dex и
-- pool_id bytes32 для v4" — the chain indexer (0001_indexer.sql) has only
-- ever scanned Uniswap v3 (a per-pool contract address, discovered from
-- the factory's PoolCreated event). v4 has no factory and no per-pool
-- contract — every v4 pool is identified by a bytes32 pool_id and lives
-- behind the single PoolManager contract (src/lib/rwa/dex/addresses.ts).
--
-- Same v3-XOR-v4 identity pattern already established for rwa_pools
-- (0003_rwa.sql) — a row is EITHER a v3 pool (pool_address set, pool_id
-- null) OR a v4 pool (pool_id set, pool_address null), enforced by a check
-- constraint rather than trusting callers. indexer_pools' primary key
-- moves from pool_address (which a v4 row doesn't have) to a synthetic id;
-- nothing else references it as a foreign key, so this is safe.
--
-- indexer_swaps.recipient is reused, not replaced, for v4 attribution:
-- v4's PoolManager Swap event (confirmed 2026-09-26 against
-- Uniswap/v4-core's IPoolManager.sol) has NO recipient field at all — only
-- `sender`, which for a swap routed through UniversalRouter is the
-- router/unlock-callback contract, not the trader (RWA_SPEC.md phase 6's
-- own note: "атрибуция для v4 через ... tx.from"). For a v4 row,
-- `recipient` therefore holds the enclosing transaction's `from` address
-- instead of an event field — documented here since it's the one place
-- this column's meaning differs from its v3 rows.
--
-- Not applied automatically — same manual-apply posture as every other
-- migration in this project.

alter table indexer_pools add column if not exists dex text not null default 'uniswap_v3' check (dex in ('uniswap_v3', 'uniswap_v4'));
alter table indexer_pools add column if not exists pool_id text;

-- Recreate the primary key as a synthetic id, preserving existing rows'
-- pool_address values (still unique per the partial index below). The old
-- PK constraint must go first — Postgres refuses to drop NOT NULL on a
-- column that's still part of a primary key.
alter table indexer_pools drop constraint if exists indexer_pools_pkey;
alter table indexer_pools alter column pool_address drop not null;
alter table indexer_pools add column if not exists id bigserial;
update indexer_pools set id = default where id is null;
alter table indexer_pools add primary key (id);

alter table indexer_pools add constraint indexer_pools_identity check (
  (dex = 'uniswap_v3' and pool_address is not null and pool_id is null) or
  (dex = 'uniswap_v4' and pool_id is not null and pool_address is null)
);

-- Plain (non-partial) unique constraints, not partial indexes like
-- rwa_pools used for the same v3-XOR-v4 split: run.ts upserts into this
-- table with `onConflict: "pool_address"`, which PostgREST/Postgres
-- compiles to `ON CONFLICT (pool_address)` — conflict-target inference
-- only matches a *non-partial* unique index/constraint. A plain UNIQUE
-- constraint on a nullable column works correctly here regardless:
-- Postgres treats every NULL as distinct from every other NULL by
-- default, so v4 rows (pool_address = null) never conflict with each
-- other or with v3 rows.
alter table indexer_pools add constraint indexer_pools_pool_address_key unique (pool_address);
alter table indexer_pools add constraint indexer_pools_pool_id_key unique (pool_id);

alter table indexer_swaps add column if not exists dex text not null default 'uniswap_v3' check (dex in ('uniswap_v3', 'uniswap_v4'));
alter table indexer_swaps add column if not exists pool_id text;
alter table indexer_swaps alter column pool_address drop not null;
alter table indexer_swaps add constraint indexer_swaps_identity check (
  (dex = 'uniswap_v3' and pool_address is not null and pool_id is null) or
  (dex = 'uniswap_v4' and pool_id is not null and pool_address is null)
);

-- v3's uniqueness key (tx_hash, log_index) still works for v4 rows (a v4
-- Swap log has its own log_index within the same tx), so it's kept as-is.
create index if not exists indexer_swaps_pool_id_idx on indexer_swaps (pool_id);
create index if not exists indexer_swaps_dex_idx on indexer_swaps (dex);

-- Separate checkpoint columns for the v4 scan — kept apart from the v3
-- pools_synced_to_block/swaps_synced_to_block columns rather than reusing
-- them, since the two scans read different events from different
-- addresses and can fall behind/catch up independently (same reasoning
-- 0005_rwa_registry_state.sql used for its own separate checkpoint).
alter table indexer_state add column if not exists v4_pools_synced_to_block bigint not null default 0;
alter table indexer_state add column if not exists v4_swaps_synced_to_block bigint not null default 0;
