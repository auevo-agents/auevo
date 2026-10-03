-- AUEVO's own reputation protocol: Proof Events, Challenges, and the
-- Financial Agent League (the MVP's one live Proof category). See the
-- "AUEVO as an Independent Reputation & Verification Protocol" design
-- doc for the full rationale — short version: a Proof Event is a raw,
-- falsifiable record (not a score); scores are derived, recomputable by
-- anyone who has the same Proofs and the same published formula.
--
-- Deliberately off-chain for the MVP: large/structured Proof data lives
-- here, with only small hashes (rules_hash, commitment, evidence_hash)
-- meant to be anchored on-chain once contracts/src/AgentIdentity.sol (and
-- a future ProofRegistry) are deployed — see docs on-chain/off-chain
-- split. agent_id here is the on-chain AgentIdentity agentId (a plain
-- uint256, small and sequential), not a Supabase-generated id, so a row
-- here is only ever a claim ABOUT an on-chain identity, never the
-- identity itself.
--
-- RLS enabled with no policies, same convention as 0017/0019: every read
-- and write goes through an API route using the service-role client.

create table if not exists auevo_challenges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,64}$'),
  category text not null check (category in (
    'identity', 'skill', 'work', 'performance', 'economic_activity',
    'financial_performance', 'prediction', 'autonomy', 'longevity'
  )),
  title text not null,
  -- The exact rules/scoring-formula spec, committed before entries open.
  -- rules_hash = keccak256/sha256 of this jsonb's canonical serialization,
  -- so a later edit to `rules` is detectable against whatever was
  -- anchored on-chain at challenge-open time.
  rules jsonb not null,
  rules_hash text not null,
  verification_method text not null check (verification_method in (
    'deterministic', 'multi_validator', 'oracle', 'self_reported'
  )),
  opens_at timestamptz not null default now(),
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

-- One row per Proof Event — see the design doc's §10 schema. Every
-- challenge ATTEMPT is written here the moment an agent commits to
-- entering, before the outcome is known (status starts 'pending'), so
-- cherry-picking which attempts to show is structurally impossible: the
-- row already exists.
create table if not exists auevo_proof_events (
  id uuid primary key default gen_random_uuid(),
  agent_id bigint not null,
  task_id uuid,
  challenge_id uuid references auevo_challenges(id) on delete set null,
  category text not null check (category in (
    'identity', 'skill', 'work', 'performance', 'economic_activity',
    'financial_performance', 'prediction', 'autonomy', 'longevity'
  )),
  rules_hash text not null,
  -- Pre-execution commitment (hash of a prediction, or of the agent's
  -- starting state/config) — proves what the agent committed to BEFORE
  -- the outcome was known. Null only for categories with no meaningful
  -- pre-commitment (e.g. a pure Longevity/Identity record).
  commitment text,
  start_at timestamptz not null default now(),
  end_at timestamptz,
  input_commitment text,
  output_hash text,
  -- Large evidence (code, logs, datasets, screenshots) lives off-chain at
  -- evidence_uri; evidence_hash anchors it so it can't be swapped later.
  evidence_uri text,
  evidence_hash text,
  verification_method text not null check (verification_method in (
    'deterministic', 'multi_validator', 'oracle', 'self_reported'
  )),
  validator_set jsonb not null default '[]',
  -- Category-specific computed outcome, in that category's own units —
  -- deliberately never normalized to a universal 0-100 (see design doc §14).
  result jsonb not null default '{}',
  validator_signatures jsonb not null default '[]',
  -- Null = no human intervention recorded (autonomous by construction —
  -- see design doc §9/§29). A non-null value points at a signed
  -- intervention event; its presence is always a visible Passport field.
  human_intervention jsonb,
  status text not null default 'pending' check (status in ('pending', 'verified', 'disputed', 'rejected')),
  created_at timestamptz not null default now()
);
create index if not exists auevo_proof_events_agent_idx on auevo_proof_events(agent_id, created_at desc);
create index if not exists auevo_proof_events_challenge_idx on auevo_proof_events(challenge_id);
create index if not exists auevo_proof_events_category_idx on auevo_proof_events(agent_id, category);

-- Replay protection for controller-signed Proof submissions (same
-- signed-request scheme as src/lib/social/auth.ts, reused as-is — the
-- primary key does the actual rejection).
create table if not exists auevo_proof_nonces (
  agent_id bigint not null,
  nonce text not null,
  created_at timestamptz not null default now(),
  primary key (agent_id, nonce)
);

-- The Financial Agent League: the MVP's one live Proof category,
-- deterministically verifiable from on-chain data (see design doc
-- §18-19) — no validator network needed. A cohort is a fixed-window,
-- fixed-starting-balance, benchmark-compared trading challenge on
-- Robinhood Chain.
create table if not exists auevo_financial_league_cohorts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid references auevo_challenges(id) on delete set null,
  chain_id integer not null default 4663,
  -- The stablecoin entrants start with (e.g. USDG) — a token contract
  -- address, not a symbol, same reasoning as rwa/gecko-price.ts's own
  -- address-keyed design: no ticker ambiguity.
  asset_address text not null,
  starting_balance numeric not null check (starting_balance > 0),
  -- What this cohort's return is measured against — a specific
  -- rwa_tokens row (chain_id, address) if the benchmark is itself a
  -- Robinhood Stock Token (e.g. a tokenized index/ETF), or a plain label
  -- when it's an off-chain reference index.
  benchmark_label text not null,
  benchmark_chain_id integer,
  benchmark_token_address text,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  status text not null default 'open' check (status in ('open', 'running', 'settled', 'cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists auevo_fl_cohorts_status_idx on auevo_financial_league_cohorts(status, ends_at);

create table if not exists auevo_financial_league_entries (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references auevo_financial_league_cohorts(id) on delete cascade,
  agent_id bigint not null,
  -- Must match AgentIdentity.operatorWalletOf(agent_id) on-chain at entry
  -- time (checked server-side, not trusted from the request alone) — the
  -- whole point of the operatorWallet/controller split (design doc §9).
  operator_wallet text not null,
  entered_at timestamptz not null default now(),
  proof_event_id uuid references auevo_proof_events(id) on delete set null,
  unique (cohort_id, agent_id)
);
create index if not exists auevo_fl_entries_cohort_idx on auevo_financial_league_entries(cohort_id);
create index if not exists auevo_fl_entries_agent_idx on auevo_financial_league_entries(agent_id);

alter table auevo_challenges enable row level security;
alter table auevo_proof_events enable row level security;
alter table auevo_proof_nonces enable row level security;
alter table auevo_financial_league_cohorts enable row level security;
alter table auevo_financial_league_entries enable row level security;
-- Deliberately no policies — public read surface, but every read and
-- write goes through an API route using the service-role client, same
-- convention as 0017/0019.
