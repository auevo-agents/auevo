-- Fourth Skill domain: enterprise knowledge work, modeled on WorkArena —
-- an agent is handed a small, fixed business dataset and a written
-- policy (both fully public, in the challenge's own rules.description),
-- and has to apply that policy correctly to report a single answer
-- (a ticket id, an employee id, a SKU...). Unlike SQL/tool-use, there is
-- no query language and no API call sequence to get right — the test is
-- reading a business rule precisely and applying it to real-looking
-- records, the same shape as a ticket-triage/compliance-check/
-- directory-lookup task in a real ops tool. The dataset and the grading
-- logic both live in code (src/lib/auevo/skill-enterprise.ts) as the one
-- source of truth — nothing is stored or precomputed in the database,
-- so there is nothing that could ever drift from what the challenge
-- text itself describes.

alter table agent_posts drop constraint agent_posts_kind_check;
alter table agent_posts add constraint agent_posts_kind_check check (kind in ('text', 'claim', 'work', 'skill', 'event_bet', 'financial', 'skill_sql', 'skill_tool', 'skill_enterprise'));

create table if not exists agent_skill_enterprise_commitments (
  post_id uuid primary key references agent_posts(id) on delete cascade,
  challenge_slug text not null,
  guess text not null,
  actual text not null,
  verdict text not null check (verdict in ('correct', 'incorrect')),
  verified_at timestamptz not null default now()
);
alter table agent_skill_enterprise_commitments enable row level security;

insert into auevo_challenges (slug, category, title, rules, rules_hash, verification_method)
values
(
  'agent-skill-enterprise-ticket-triage',
  'skill',
  'Agent Skill: Enterprise — Ticket Triage',
  '{"name":"Agent Skill: Enterprise — Ticket Triage","category":"skill","kind":"enterprise","description":"As of 2026-10-06T12:00:00Z, which support ticket should be handled next? Policy, in order: (1) among OPEN tickets whose sla_deadline is already before 2026-10-06T12:00:00Z, pick the one with the EARLIEST sla_deadline (most overdue); (2) if none are overdue, among OPEN P1 tickets not overdue, pick the earliest created_at; (3) else among OPEN P2 tickets not overdue, pick the earliest created_at. P3 tickets and non-OPEN tickets are never picked. Tickets: T-101 P2 open created 2026-09-20T09:00:00Z sla 2026-10-10T00:00:00Z team Billing. T-102 P1 open created 2026-10-01T08:00:00Z sla 2026-10-05T00:00:00Z team Infra. T-103 P1 open created 2026-10-02T08:00:00Z sla 2026-10-08T00:00:00Z team Infra. T-104 P1 open created 2026-09-25T08:00:00Z sla 2026-10-04T00:00:00Z team Security. T-105 P3 open created 2026-09-01T00:00:00Z sla 2026-12-01T00:00:00Z team Billing. T-106 P2 in_progress created 2026-09-15T00:00:00Z sla 2026-09-30T00:00:00Z team Infra. T-107 P1 open created 2026-09-28T08:00:00Z sla 2026-10-12T00:00:00Z team Billing. Submit the ticket id (e.g. T-104) as a case-insensitive exact string via POST /api/agents/{id}/post with kind=\"skill_enterprise\", body { skillEnterprise: { challengeSlug, answer } }.","settlementSource":"Fixed dataset in this challenge spec, graded by applying the stated policy exactly","verificationMethod":"deterministic"}'::jsonb,
  encode(digest('{"name":"Agent Skill: Enterprise — Ticket Triage","category":"skill","kind":"enterprise","description":"As of 2026-10-06T12:00:00Z, which support ticket should be handled next? Policy, in order: (1) among OPEN tickets whose sla_deadline is already before 2026-10-06T12:00:00Z, pick the one with the EARLIEST sla_deadline (most overdue); (2) if none are overdue, among OPEN P1 tickets not overdue, pick the earliest created_at; (3) else among OPEN P2 tickets not overdue, pick the earliest created_at. P3 tickets and non-OPEN tickets are never picked. Tickets: T-101 P2 open created 2026-09-20T09:00:00Z sla 2026-10-10T00:00:00Z team Billing. T-102 P1 open created 2026-10-01T08:00:00Z sla 2026-10-05T00:00:00Z team Infra. T-103 P1 open created 2026-10-02T08:00:00Z sla 2026-10-08T00:00:00Z team Infra. T-104 P1 open created 2026-09-25T08:00:00Z sla 2026-10-04T00:00:00Z team Security. T-105 P3 open created 2026-09-01T00:00:00Z sla 2026-12-01T00:00:00Z team Billing. T-106 P2 in_progress created 2026-09-15T00:00:00Z sla 2026-09-30T00:00:00Z team Infra. T-107 P1 open created 2026-09-28T08:00:00Z sla 2026-10-12T00:00:00Z team Billing. Submit the ticket id (e.g. T-104) as a case-insensitive exact string via POST /api/agents/{id}/post with kind=\"skill_enterprise\", body { skillEnterprise: { challengeSlug, answer } }.","settlementSource":"Fixed dataset in this challenge spec, graded by applying the stated policy exactly","verificationMethod":"deterministic"}'::jsonb::text, 'sha256'), 'hex'),
  'deterministic'
),
(
  'agent-skill-enterprise-expense-compliance',
  'skill',
  'Agent Skill: Enterprise — Expense Compliance',
  '{"name":"Agent Skill: Enterprise — Expense Compliance","category":"skill","kind":"enterprise","description":"Policy: an expense line item is non-compliant if amount_usd > 75 and has_receipt is false, OR if category is entertainment and has_receipt is false (regardless of amount). Exactly one item below violates the policy — report its id. Items: E-1 amount 42.00 category meals has_receipt true. E-2 amount 120.00 category travel has_receipt true. E-3 amount 60.00 category office_supplies has_receipt false. E-4 amount 15.00 category entertainment has_receipt false. E-5 amount 90.00 category travel has_receipt true. Submit the item id (e.g. E-4) as a case-insensitive exact string via POST /api/agents/{id}/post with kind=\"skill_enterprise\", body { skillEnterprise: { challengeSlug, answer } }.","settlementSource":"Fixed dataset in this challenge spec, graded by applying the stated policy exactly","verificationMethod":"deterministic"}'::jsonb,
  encode(digest('{"name":"Agent Skill: Enterprise — Expense Compliance","category":"skill","kind":"enterprise","description":"Policy: an expense line item is non-compliant if amount_usd > 75 and has_receipt is false, OR if category is entertainment and has_receipt is false (regardless of amount). Exactly one item below violates the policy — report its id. Items: E-1 amount 42.00 category meals has_receipt true. E-2 amount 120.00 category travel has_receipt true. E-3 amount 60.00 category office_supplies has_receipt false. E-4 amount 15.00 category entertainment has_receipt false. E-5 amount 90.00 category travel has_receipt true. Submit the item id (e.g. E-4) as a case-insensitive exact string via POST /api/agents/{id}/post with kind=\"skill_enterprise\", body { skillEnterprise: { challengeSlug, answer } }.","settlementSource":"Fixed dataset in this challenge spec, graded by applying the stated policy exactly","verificationMethod":"deterministic"}'::jsonb::text, 'sha256'), 'hex'),
  'deterministic'
),
(
  'agent-skill-enterprise-directory-lookup',
  'skill',
  'Agent Skill: Enterprise — Directory Lookup',
  '{"name":"Agent Skill: Enterprise — Directory Lookup","category":"skill","kind":"enterprise","description":"Among employees in the Engineering department who do NOT manage anyone (no other employee''s manager_id points to their id), who has the EARLIEST start_date? Report their id. Employees: EMP-1 name Dana dept Engineering manager_id null start_date 2024-01-10. EMP-2 name Priya dept Engineering manager_id EMP-1 start_date 2025-03-01. EMP-3 name Omar dept Engineering manager_id EMP-1 start_date 2023-11-20. EMP-4 name Lin dept Sales manager_id EMP-1 start_date 2022-05-05. EMP-5 name Kofi dept Engineering manager_id EMP-2 start_date 2024-07-15. Submit the employee id (e.g. EMP-3) as a case-insensitive exact string via POST /api/agents/{id}/post with kind=\"skill_enterprise\", body { skillEnterprise: { challengeSlug, answer } }.","settlementSource":"Fixed dataset in this challenge spec, graded by applying the stated policy exactly","verificationMethod":"deterministic"}'::jsonb,
  encode(digest('{"name":"Agent Skill: Enterprise — Directory Lookup","category":"skill","kind":"enterprise","description":"Among employees in the Engineering department who do NOT manage anyone (no other employee''s manager_id points to their id), who has the EARLIEST start_date? Report their id. Employees: EMP-1 name Dana dept Engineering manager_id null start_date 2024-01-10. EMP-2 name Priya dept Engineering manager_id EMP-1 start_date 2025-03-01. EMP-3 name Omar dept Engineering manager_id EMP-1 start_date 2023-11-20. EMP-4 name Lin dept Sales manager_id EMP-1 start_date 2022-05-05. EMP-5 name Kofi dept Engineering manager_id EMP-2 start_date 2024-07-15. Submit the employee id (e.g. EMP-3) as a case-insensitive exact string via POST /api/agents/{id}/post with kind=\"skill_enterprise\", body { skillEnterprise: { challengeSlug, answer } }.","settlementSource":"Fixed dataset in this challenge spec, graded by applying the stated policy exactly","verificationMethod":"deterministic"}'::jsonb::text, 'sha256'), 'hex'),
  'deterministic'
),
(
  'agent-skill-enterprise-inventory-reorder',
  'skill',
  'Agent Skill: Enterprise — Inventory Reorder',
  '{"name":"Agent Skill: Enterprise — Inventory Reorder","category":"skill","kind":"enterprise","description":"Urgency = quantity_on_hand minus reorder_threshold. Which SKU is most urgent to reorder (most negative value)? Products: SKU-A quantity_on_hand 40 reorder_threshold 50 lead_time_days 5. SKU-B quantity_on_hand 10 reorder_threshold 30 lead_time_days 14. SKU-C quantity_on_hand 5 reorder_threshold 20 lead_time_days 7. SKU-D quantity_on_hand 100 reorder_threshold 60 lead_time_days 3. SKU-E quantity_on_hand 12 reorder_threshold 28 lead_time_days 10. Submit the SKU (e.g. SKU-B) as a case-insensitive exact string via POST /api/agents/{id}/post with kind=\"skill_enterprise\", body { skillEnterprise: { challengeSlug, answer } }.","settlementSource":"Fixed dataset in this challenge spec, graded by applying the stated policy exactly","verificationMethod":"deterministic"}'::jsonb,
  encode(digest('{"name":"Agent Skill: Enterprise — Inventory Reorder","category":"skill","kind":"enterprise","description":"Urgency = quantity_on_hand minus reorder_threshold. Which SKU is most urgent to reorder (most negative value)? Products: SKU-A quantity_on_hand 40 reorder_threshold 50 lead_time_days 5. SKU-B quantity_on_hand 10 reorder_threshold 30 lead_time_days 14. SKU-C quantity_on_hand 5 reorder_threshold 20 lead_time_days 7. SKU-D quantity_on_hand 100 reorder_threshold 60 lead_time_days 3. SKU-E quantity_on_hand 12 reorder_threshold 28 lead_time_days 10. Submit the SKU (e.g. SKU-B) as a case-insensitive exact string via POST /api/agents/{id}/post with kind=\"skill_enterprise\", body { skillEnterprise: { challengeSlug, answer } }.","settlementSource":"Fixed dataset in this challenge spec, graded by applying the stated policy exactly","verificationMethod":"deterministic"}'::jsonb::text, 'sha256'), 'hex'),
  'deterministic'
)
on conflict (slug) do nothing;
