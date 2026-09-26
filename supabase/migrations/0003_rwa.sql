-- RWA (tokenized real-world asset) catalog — docs/RWA_SPEC.md section 5.
-- The rest of that section's schema beyond app_transfers (already created
-- in 0002_app_transfers.sql, ahead of this migration, since Phase 2 was
-- prioritized ahead of Phase 1 per the spec's own "БЛОКЕР №1" call).
--
-- Not applied automatically. Run this against the Supabase project
-- backing SUPABASE_URL for this app (Settings -> Database -> SQL
-- Editor, or `supabase db push` with the CLI).

create table if not exists rwa_issuers (
  id text primary key, -- slug, e.g. "ondo", "xstocks", "robinhood"
  name text not null,
  suffix text, -- ticker suffix this issuer's tokens use, e.g. "on" for Ondo's NVDAon — null for issuers with no suffix convention (Robinhood itself)
  website text,
  description text,
  backing_note text -- how this issuer says the token is backed, in their own words — never asserted by us as fact, see RWA_SPEC.md section 4
);

create table if not exists rwa_underlyings (
  ticker text primary key, -- e.g. "NVDA"
  name text not null,
  category text not null check (category in ('stock', 'etf', 'commodity', 'treasury', 'private_credit')),
  exchange text, -- e.g. "NASDAQ" — null for non-exchange-traded categories (private_credit)
  reference_source text -- which reference-price provider resolves this ticker (see src/lib/rwa/reference-price.ts) — null if none is configured, in which case premium is never computed for it, never guessed
);

create table if not exists rwa_tokens (
  chain_id integer not null,
  address text not null,
  underlying_ticker text not null references rwa_underlyings (ticker),
  issuer_id text not null references rwa_issuers (id),
  symbol text not null,
  decimals integer not null,
  is_proxy boolean not null default false,
  verified boolean not null default false, -- RWA_SPEC.md section 9: "Показ verified=false токенов в витрине" is explicitly on the "не делать" list — a token stays in this table for the registry's own bookkeeping, just never rendered, until it clears verification
  first_seen_block bigint,
  logo_url text,
  discovered_at timestamptz not null default now(),
  primary key (chain_id, address)
);

create index if not exists rwa_tokens_underlying_idx on rwa_tokens (underlying_ticker);
create index if not exists rwa_tokens_issuer_idx on rwa_tokens (issuer_id);

create table if not exists rwa_prices (
  id bigserial primary key,
  chain_id integer not null,
  token_address text not null,
  price_usd numeric,
  reference_price_usd numeric, -- null when rwa_underlyings.reference_source is unset for this ticker — never a guess (RWA_SPEC.md section 4: "если источника нет — premium = null, не выдумывать")
  premium_bps integer, -- (price_usd / reference_price_usd - 1) * 10000, null whenever either input price is null
  liquidity_usd numeric,
  volume_24h_usd numeric,
  mkt_cap_usd numeric,
  ts timestamptz not null default now(),
  foreign key (chain_id, token_address) references rwa_tokens (chain_id, address)
);

create index if not exists rwa_prices_token_idx on rwa_prices (chain_id, token_address, ts desc);
create index if not exists rwa_prices_ts_idx on rwa_prices (ts);

create table if not exists rwa_risk (
  chain_id integer not null,
  token_address text not null,
  admin_address text,
  upgradeable boolean,
  can_pause boolean,
  can_blacklist boolean,
  can_force_transfer boolean,
  can_burn_others boolean,
  mint_role_holders jsonb, -- array of addresses holding a mint-capable role
  score integer check (score between 0 and 100),
  checked_at timestamptz not null default now(),
  raw jsonb, -- the full underlying scan result (evm/capabilities.ts shape) — the score's "why" the UI explains itself from this, not a black box
  primary key (chain_id, token_address),
  foreign key (chain_id, token_address) references rwa_tokens (chain_id, address)
);

create table if not exists rwa_pools (
  chain_id integer not null,
  pool_address text, -- v3: the pool contract address; v4: null (no per-pool contract — see pool_id)
  pool_id text, -- v4: bytes32 PoolId (src/lib/rwa/dex/pool-key.ts); v3: null
  dex text not null check (dex in ('uniswap_v3', 'uniswap_v4')),
  token0 text not null,
  token1 text not null,
  fee integer not null,
  tick_spacing integer,
  hooks text,
  liquidity_usd numeric,
  volume_24h_usd numeric,
  updated_at timestamptz not null default now(),
  constraint rwa_pools_identity check (
    (dex = 'uniswap_v3' and pool_address is not null and pool_id is null) or
    (dex = 'uniswap_v4' and pool_id is not null and pool_address is null)
  )
);

create unique index if not exists rwa_pools_v3_idx on rwa_pools (chain_id, pool_address) where dex = 'uniswap_v3';
create unique index if not exists rwa_pools_v4_idx on rwa_pools (chain_id, pool_id) where dex = 'uniswap_v4';
create index if not exists rwa_pools_token0_idx on rwa_pools (chain_id, token0);
create index if not exists rwa_pools_token1_idx on rwa_pools (chain_id, token1);

create table if not exists baskets (
  id text primary key,
  kind text not null check (kind in ('strategy', 'index', 'automated')),
  name text not null,
  description text,
  chain_id integer not null,
  holdings jsonb not null, -- [{token, weight}]
  source text not null check (source in ('auevo', 'reserve', 'glider')),
  one_year_return numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists alerts (
  id bigserial primary key,
  account text not null, -- the subscribing wallet address
  type text not null check (type in ('premium', 'listing', 'whale', 'price')),
  params jsonb not null,
  channel text not null default 'web' check (channel in ('web', 'telegram')),
  created_at timestamptz not null default now()
);

create index if not exists alerts_account_idx on alerts (account);

-- RWA_SPEC.md section 5: "RLS: публичное чтение для каталоговых таблиц,
-- запись только service role" — a deliberate departure from every other
-- table in this project (indexer_*, app_transfers), which are enabled
-- with zero policies and read exclusively through server-side API routes
-- using the service-role key. The catalog here is public information by
-- its own nature (an asset listing, not per-user data), and RWA_SPEC.md
-- explicitly wants it directly queryable with the anon key — Phase 3's
-- Assets page can filter/sort client-side against Supabase directly
-- instead of proxying every filter change through a Next.js API route.
-- Write access stays service-role-only either way: no insert/update/
-- delete policy is created for anon, so RLS denies those by default once
-- enabled, the same as it always has for every other table.
alter table rwa_issuers enable row level security;
alter table rwa_underlyings enable row level security;
alter table rwa_tokens enable row level security;
alter table rwa_prices enable row level security;
alter table rwa_risk enable row level security;
alter table rwa_pools enable row level security;
alter table baskets enable row level security;

create policy "public read" on rwa_issuers for select using (true);
create policy "public read" on rwa_underlyings for select using (true);
-- Verification status is still public to read (the registry's own
-- bookkeeping is not a secret) — it's the *application code* that must
-- never render a verified=false row, not the database that must hide it.
create policy "public read" on rwa_tokens for select using (true);
create policy "public read" on rwa_prices for select using (true);
create policy "public read" on rwa_risk for select using (true);
create policy "public read" on rwa_pools for select using (true);
create policy "public read" on baskets for select using (true);

-- alerts is per-user configuration, not a catalog table — same
-- locked-down posture as app_transfers: enabled, no policies, service
-- role only.
alter table alerts enable row level security;

-- Seed: the 12 issuers HyperDex's own catalog covers (docs/RWA_SPEC.md
-- section 2, researched 2026-09-26) — a starting allowlist, not a claim
-- that Auevo has independently verified each one's backing.
insert into rwa_issuers (id, name, suffix, backing_note) values
  ('ondo', 'Ondo Finance', 'on', 'Tokenized equities and USDY, per Ondo''s own disclosures'),
  ('xstocks', 'xStocks (Backed Finance)', 'x', '1:1 backed per Backed Finance''s own disclosures'),
  ('robinhood', 'Robinhood', null, 'Tokenized equities issued by Robinhood, per Robinhood''s own disclosures'),
  ('coinbase', 'Coinbase', 'c', 'Tokenized equities issued by Coinbase, per Coinbase''s own disclosures'),
  ('bstocks', 'bStocks', 'B', 'Tokenized equities per bStocks'' own disclosures'),
  ('tether', 'Tether', null, 'XAUT — gold-backed, per Tether''s own disclosures'),
  ('paxos', 'Paxos', null, 'PAXG — gold-backed, and USDG (this app''s own quote asset), per Paxos''s own disclosures'),
  ('maple', 'Maple Finance', null, 'syrupUSDC/syrupUSDT — private credit, per Maple''s own disclosures'),
  ('usdai', 'USD.AI', null, 'sUSDai, per USD.AI''s own disclosures'),
  ('ethena', 'Ethena', null, 'USDtb, per Ethena''s own disclosures'),
  ('theo', 'Theo', null, 'thBILL — treasury-backed, per Theo''s own disclosures'),
  ('backed', 'Backed Finance', null, 'bCSPX and Ondo USDY-adjacent products, per Backed''s own disclosures')
on conflict (id) do nothing;
