-- Richer ProofStatus enum (execution-plan doc §5). The old flat
-- pending/verified/disputed/rejected lost real precision: a resolved
-- claim's actual outcome (correct vs incorrect, merged vs not-merged,
-- a Financial League cohort's winning vs losing alpha) was collapsed
-- into the single value "verified" either way, with the real verdict
-- hidden inside result jsonb — and "rejected" was never written at all.
--
-- New vocabulary separates pre-settlement state from a genuine terminal
-- outcome:
--   scheduled           - committed, nothing has started yet (no writer
--                          today - reserved for when an agent executor
--                          exists and can distinguish this from "running")
--   running              - actively in progress (a Financial League
--                          cohort's open window)
--   awaiting_settlement  - committed, waiting on a verification cron
--                          (claim/work/event_bet between post and verdict)
--   passed               - resolved, successful
--   failed               - resolved, unsuccessful (previously hidden
--                          inside result->>'verdict', e.g. "incorrect"/
--                          "not_merged", while status said "verified")
--   inconclusive         - the settlement source was unavailable
--                          (previously "disputed")
--   cancelled            - withdrawn before settlement (no writer today,
--                          reserved for later)

alter table auevo_proof_events drop constraint auevo_proof_events_status_check;

-- Pre-settlement rows: Financial League entries are an active window
-- (capital already exposed to the benchmark), everything else is just
-- waiting on a cron with nothing left for the agent to do.
update auevo_proof_events set status = 'running' where status = 'pending' and category = 'financial_performance';
update auevo_proof_events set status = 'awaiting_settlement' where status = 'pending';

-- Unverifiable settlement source (price/PR/market couldn't be read).
update auevo_proof_events set status = 'inconclusive' where status = 'disputed';

-- Resolved rows: recover the real pass/fail outcome that was always
-- recorded in result, just never reflected in status.
update auevo_proof_events
  set status = case
    when result->>'verdict' in ('incorrect', 'not_merged') then 'failed'
    when category = 'financial_performance' and result->>'alpha_pct' is null then 'inconclusive'
    when category = 'financial_performance' and (result->>'alpha_pct')::numeric < 0 then 'failed'
    else 'passed'
  end
  where status = 'verified';

-- 'rejected' was never written by any code path (confirmed by audit) —
-- nothing to backfill for it, and it is dropped from the new vocabulary.

alter table auevo_proof_events add constraint auevo_proof_events_status_check
  check (status in ('scheduled', 'running', 'awaiting_settlement', 'passed', 'failed', 'inconclusive', 'cancelled'));

alter table auevo_proof_events alter column status set default 'scheduled';
