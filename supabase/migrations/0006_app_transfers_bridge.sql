-- RWA_SPEC.md Phase 4 (Swap & Bridge via LI.FI) needs app_transfers to
-- represent a cross-chain leg, not just Phase 2's single-chain Robinhood
-- swaps: the destination can now be a different chain, and the route is
-- executed by a named bridge/DEX tool (LI.FI's own `step.tool`, e.g.
-- "across", "stargate") rather than always "v4"/"v3+v4".
--
-- Both columns are nullable and additive — every existing row (all
-- single-chain Phase 2 swaps) is valid with to_chain_id left null;
-- src/app/api/rwa/transfers/route.ts (the Explorer page's reader) treats a
-- null to_chain_id as "same chain as chain_id" rather than backfilling it.

alter table app_transfers add column if not exists to_chain_id integer;
alter table app_transfers add column if not exists bridge_tool text;

comment on column app_transfers.to_chain_id is 'Destination chain id for a cross-chain LI.FI transfer. Null means same-chain as chain_id (a Robinhood Chain v3/v4 swap, or a LI.FI same-chain swap).';
comment on column app_transfers.bridge_tool is 'LI.FI step.tool (e.g. "across", "stargate") for a bridge leg. Null for a Robinhood Chain v3/v4 swap.';
