-- Fix: rwa_pools' v4 upsert (run-registry.ts, Phase 8) does
-- `.upsert(rows, { onConflict: "chain_id,pool_id" })`, which PostgREST
-- compiles to `ON CONFLICT (chain_id, pool_id) DO UPDATE ...` with no
-- WHERE clause. Postgres's conflict-target inference only matches a
-- *non-partial* unique index/constraint against a plain column list, so
-- it never matched rwa_pools_v4_idx (partial: `where dex =
-- 'uniswap_v4'`) — every pools upsert failed in production with
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" (confirmed 2026-09-26).
--
-- Same fix already applied to indexer_pools in 0007_indexer_v4.sql:
-- replace the partial indexes with plain UNIQUE constraints. Postgres
-- treats every NULL as distinct from every other NULL by default, so
-- this keeps the identical v3-XOR-v4 behavior (many v4 rows with
-- pool_address = null never conflict with each other, and vice versa
-- for v3 rows' null pool_id) without needing a partial predicate.
--
-- Applied directly to the project via Supabase MCP on 2026-09-26 —
-- this file documents it, same manual-apply posture as every other
-- migration here.

drop index if exists rwa_pools_v3_idx;
drop index if exists rwa_pools_v4_idx;

alter table rwa_pools add constraint rwa_pools_pool_address_key unique (chain_id, pool_address);
alter table rwa_pools add constraint rwa_pools_pool_id_key unique (chain_id, pool_id);
