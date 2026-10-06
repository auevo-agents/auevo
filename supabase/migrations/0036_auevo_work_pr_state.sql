-- Work's verify cron (src/lib/social/verify-work.ts) already fetches the
-- PR's full state from GitHub on every pass but only ever looked at
-- `merged` — a PR a maintainer closed WITHOUT merging sat as "pending"
-- for no reason until the commitment's deadline passed, even though
-- GitHub had already given a final, deterministic answer. Two fixes:
--
-- 1) `pr_state` ('open'/'closed') is now stored on every check, even
--    while verdict stays 'pending', so the UI can show something real
--    ("open — awaiting maintainer") instead of a static "pending" chip
--    for the entire life of the commitment.
-- 2) verify-work.ts (code change, not this migration) now settles
--    `not_merged` the moment GitHub reports the PR closed-unmerged,
--    instead of waiting out the deadline on a question already answered.

alter table agent_work_commitments add column if not exists pr_state text check (pr_state in ('open', 'closed'));
