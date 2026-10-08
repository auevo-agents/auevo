-- Minimal slice of docs/RWA_SPEC.md section 5's schema — just the
-- app_transfers table, which RWA_SPEC.md phase 2 (Uniswap v4 trading)
-- needs to log each swap it executes. Deliberately NOT the rest of that
-- section's schema (rwa_issuers, rwa_underlyings, rwa_tokens, etc.):
-- phase 2 is being built ahead of phase 1 (asset registry) per its own
-- priority as "BLOCKER #1", so this migration is scoped to only what
-- phase 2 actually reads/writes. Phase 1's migration extends this file
-- (or adds its own) with the rest once it starts.
--
-- Not applied automatically. Run this against the Supabase project
-- backing SUPABASE_URL for this app (Settings -> Database -> SQL
-- Editor, or `supabase db push` with the CLI).

create table if not exists app_transfers (
  id bigserial primary key,
  -- The connected wallet that initiated the swap — not necessarily
  -- `recipient` below, which is who the output actually went to (almost
  -- always the same address, but kept separate to match how the
  -- on-chain event data is actually shaped).
  account text not null,
  recipient text not null,
  chain_id integer not null,
  src_token text not null,
  dst_token text not null,
  -- Raw amounts in the token's own smallest unit — numeric, not bigint,
  -- for the same overflow reason as indexer_swaps' amount0/amount1.
  amount_in numeric not null,
  -- Nullable: the quoted amount is known before the transaction confirms;
  -- filled in once a receipt is available, if the caller bothers to
  -- follow up (RWA_SPEC.md's own Explorer page is what actually needs
  -- this filled in, not phase 2 itself).
  amount_out numeric,
  route text not null, -- e.g. "v4", "v3", "v3+v4" — see src/lib/rwa/dex/quote.ts's RouteQuote
  fee_bps integer not null default 0,
  tx_hash text,
  status text not null default 'pending', -- pending | done | partial | refunded | failed — RWA_SPEC.md section 2's own Explorer states
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_transfers_account_idx on app_transfers (account);
create index if not exists app_transfers_tx_hash_idx on app_transfers (tx_hash);
create index if not exists app_transfers_created_at_idx on app_transfers (created_at);

-- Same posture as every other table in this project: RLS enabled, no
-- policies — locked to the service role only.
alter table app_transfers enable row level security;
