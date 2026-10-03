-- Captures each Financial League entrant's own starting point at the
-- moment it actually enters (not the cohort's nominal starts_at), since
-- entries can be staggered during a cohort's open window. Without this,
-- settlement would have to assume every entrant started at the same
-- instant, which isn't true and would make the "deterministic, read
-- straight off the chain" verification claim (design doc §13/§18-19)
-- inaccurate for anyone who joined late.
alter table auevo_financial_league_entries
  add column if not exists entry_operator_balance numeric,
  add column if not exists entry_benchmark_price numeric;

-- The benchmark's price at settlement — one value per cohort, since
-- settlement happens once for the whole cohort at ends_at.
alter table auevo_financial_league_cohorts
  add column if not exists settlement_benchmark_price numeric;
