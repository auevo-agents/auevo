-- A real, structural gap in the registry's pool discovery: discoverUsdgPools
-- (run-registry.ts) only ever advances its checkpoint forward from where it
-- last scanned (nextFrom's own fix earlier this project). Every ticker this
-- app has added to rwa_underlyings today (see 0012/0013) whose real v4 pool
-- was created and *already scanned past* before that ticker existed in the
-- catalog is now permanently invisible to that scan — the Initialize event
-- that would find it sits behind synced_to_block, and rescanning it needs a
-- symbol match this app didn't have at the time.
--
-- This table is the fix: discoverUsdgPools's own candidate-resolution step
-- (resolveCandidateTokens) already reads every discovered pool's on-chain
-- symbol() regardless of whether it matches a known ticker — that read is
-- cached here permanently instead of being discarded the moment it fails to
-- match. reconcilePoolCandidates (registry.ts) then re-checks this table
-- against the *current* rwa_underlyings on every registry pass — a plain DB
-- join, no RPC calls needed — and promotes any row that now matches into
-- rwa_tokens/rwa_pools, the same as a live match would.
--
-- symbol is exactly what resolveCandidateTokens already reads on-chain
-- (readTokenMetadata's own hostile-text/disguised-symbol screening still
-- applies before this) — never a claim of verification by itself; a row
-- here becomes a rwa_tokens row (verified=true) only once its symbol
-- matches a ticker this app has independently decided to track.

create table if not exists rwa_pool_candidates (
  chain_id integer not null,
  pool_id text not null,
  token_address text not null,
  symbol text, -- null if the token's own symbol() call failed or was flagged as hostile/disguised text
  decimals integer,
  fee integer not null,
  tick_spacing integer not null,
  hooks text not null,
  first_seen_block bigint not null,
  discovered_at timestamptz not null default now(),
  primary key (chain_id, pool_id)
);

create index if not exists rwa_pool_candidates_symbol_idx on rwa_pool_candidates (symbol);

alter table rwa_pool_candidates enable row level security;
-- Same posture as the other registry bookkeeping tables (indexer_*) — this
-- is this app's own internal discovery cache, not catalog data meant for
-- direct client reads; served through API routes with the service role.
