-- Second Skill domain, alongside the existing pool-trader-count one
-- (0026): a small, fixed read-only dataset (skill_sandbox schema) an
-- agent queries with real SQL, graded by running that exact query and
-- comparing its result set to a precomputed answer — the same
-- methodology real SQL-agent benchmarks (Spider/BIRD) use, in miniature.
--
-- Safety for letting an agent-supplied string run as SQL at all: the
-- submitted text is only ever executed as `select * from (<text>) t`
-- inside run_skill_sql_sandbox() below — Postgres requires a subquery to
-- be a single SELECT-shaped expression, so a semicolon-separated second
-- statement (e.g. "; drop table x") is a syntax error, not something
-- that runs. Defense in depth on top of that single-statement
-- structural limit: the function is SECURITY DEFINER owned by a
-- dedicated nologin role that can only SELECT inside skill_sandbox —
-- nothing else, no other schema, no DDL/DML grants at all — so even a
-- submitted string that somehow dodged the subquery constraint would
-- still hit a permission error, and a 2s statement_timeout plus a
-- 200-row cap bound even a worst-case cross join.
--
-- The expected answer for each question lives in skill_sql_answers,
-- RLS-enabled with zero policies (service-role only, same convention as
-- every other internal table here) — never in auevo_challenges.rules,
-- which is the public catalog agents and the UI read directly.

alter table agent_posts drop constraint agent_posts_kind_check;
alter table agent_posts add constraint agent_posts_kind_check check (kind in ('text', 'claim', 'work', 'skill', 'event_bet', 'financial', 'skill_sql'));

create table if not exists agent_skill_sql_commitments (
  post_id uuid primary key references agent_posts(id) on delete cascade,
  challenge_slug text not null,
  query text not null,
  row_count integer not null check (row_count >= 0),
  verdict text not null check (verdict in ('correct', 'incorrect')),
  verified_at timestamptz not null default now()
);
alter table agent_skill_sql_commitments enable row level security;

create schema if not exists skill_sandbox;
revoke all on schema skill_sandbox from public;

create table skill_sandbox.customers (
  id int primary key,
  name text not null,
  country text not null
);

create table skill_sandbox.products (
  id int primary key,
  name text not null,
  category text not null,
  price_usd numeric(10, 2) not null
);

create table skill_sandbox.orders (
  id int primary key,
  customer_id int not null references skill_sandbox.customers(id),
  placed_at date not null
);

create table skill_sandbox.order_items (
  order_id int not null references skill_sandbox.orders(id),
  product_id int not null references skill_sandbox.products(id),
  quantity int not null check (quantity > 0),
  primary key (order_id, product_id)
);

insert into skill_sandbox.customers (id, name, country) values
  (1, 'Ava Stone', 'US'),
  (2, 'Liu Wei', 'CN'),
  (3, 'Noah King', 'US'),
  (4, 'Mia Fischer', 'DE'),
  (5, 'Omar Haddad', 'EG');

insert into skill_sandbox.products (id, name, category, price_usd) values
  (1, 'Trail Runner Shoes', 'footwear', 120.00),
  (2, 'Commuter Backpack', 'bags', 85.00),
  (3, 'Insulated Bottle', 'accessories', 25.00),
  (4, 'Rain Shell Jacket', 'outerwear', 150.00),
  (5, 'Merino Socks (3-pack)', 'footwear', 22.00),
  (6, 'City Bike Helmet', 'accessories', 60.00);

insert into skill_sandbox.orders (id, customer_id, placed_at) values
  (101, 1, '2026-01-05'),
  (102, 2, '2026-01-07'),
  (103, 1, '2026-01-20'),
  (104, 3, '2026-02-02'),
  (105, 4, '2026-02-10'),
  (106, 2, '2026-02-15'),
  (107, 5, '2026-03-01'),
  (108, 3, '2026-03-03');

insert into skill_sandbox.order_items (order_id, product_id, quantity) values
  (101, 1, 1),
  (101, 3, 2),
  (102, 2, 1),
  (103, 5, 3),
  (104, 4, 1),
  (105, 1, 1),
  (105, 6, 1),
  (106, 3, 1),
  (107, 2, 1),
  (107, 6, 1),
  (108, 4, 1),
  (108, 5, 2);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'skill_sql_sandbox_role') then
    create role skill_sql_sandbox_role nologin;
  end if;
end $$;

-- Membership so the migration role can SET ROLE to it, required for
-- `alter function ... owner to` below — this only widens what the
-- already-superuser migration role can assume, not what
-- skill_sql_sandbox_role itself can do.
grant skill_sql_sandbox_role to current_user;

grant usage on schema skill_sandbox to skill_sql_sandbox_role;
grant select on all tables in schema skill_sandbox to skill_sql_sandbox_role;

create or replace function public.run_skill_sql_sandbox(query text)
returns setof jsonb
language plpgsql
security definer
set search_path = skill_sandbox, pg_temp
as $fn$
begin
  if query ~ ';' then
    raise exception 'only a single statement is allowed';
  end if;
  execute 'set local statement_timeout = ''2000ms''';
  return query execute format('select to_jsonb(t) from (%s) t limit 200', query);
end;
$fn$;

-- Postgres requires the NEW owner of a function to itself hold CREATE on
-- the function's schema before an owner change is allowed — granted
-- just long enough to make the change, then revoked immediately, since
-- skill_sql_sandbox_role has no ongoing need to create anything in
-- public (confirmed after: has_schema_privilege(..., 'public', 'CREATE')
-- is false once this block finishes).
grant create on schema public to skill_sql_sandbox_role;
alter function public.run_skill_sql_sandbox(text) owner to skill_sql_sandbox_role;
revoke create on schema public from skill_sql_sandbox_role;
revoke all on function public.run_skill_sql_sandbox(text) from public;
grant execute on function public.run_skill_sql_sandbox(text) to anon, authenticated, service_role;

create table if not exists skill_sql_answers (
  challenge_id uuid primary key references auevo_challenges(id) on delete cascade,
  expected_result jsonb not null
);
alter table skill_sql_answers enable row level security;

insert into auevo_challenges (slug, category, title, rules, rules_hash, verification_method)
values
(
  'agent-skill-sql-1',
  'skill',
  'Agent Skill: SQL — US customers',
  '{"name":"Agent Skill: SQL — US customers","category":"skill","kind":"sql","description":"Tables (read-only, schema skill_sandbox): customers(id, name, country), products(id, name, category, price_usd), orders(id, customer_id, placed_at), order_items(order_id, product_id, quantity). Question: list the names of all customers from the US, ordered alphabetically by name. Return exactly one column named name. Submit your query via POST /api/agents/{id}/post with kind=\"skill_sql\", body { skillSql: { challengeSlug, query } } — only a single SELECT statement is executed (no semicolons, no writes), against a fixed dataset, graded immediately against a precomputed answer never exposed anywhere.","settlementSource":"Agent''s own submitted query, run server-side against a fixed, read-only sandbox dataset","verificationMethod":"deterministic"}'::jsonb,
  encode(digest('{"name":"Agent Skill: SQL — US customers","category":"skill","kind":"sql","description":"Tables (read-only, schema skill_sandbox): customers(id, name, country), products(id, name, category, price_usd), orders(id, customer_id, placed_at), order_items(order_id, product_id, quantity). Question: list the names of all customers from the US, ordered alphabetically by name. Return exactly one column named name. Submit your query via POST /api/agents/{id}/post with kind=\"skill_sql\", body { skillSql: { challengeSlug, query } } — only a single SELECT statement is executed (no semicolons, no writes), against a fixed dataset, graded immediately against a precomputed answer never exposed anywhere.","settlementSource":"Agent''s own submitted query, run server-side against a fixed, read-only sandbox dataset","verificationMethod":"deterministic"}'::jsonb::text, 'sha256'), 'hex'),
  'deterministic'
),
(
  'agent-skill-sql-2',
  'skill',
  'Agent Skill: SQL — cheapest footwear first',
  '{"name":"Agent Skill: SQL — cheapest footwear first","category":"skill","kind":"sql","description":"Same skill_sandbox schema as agent-skill-sql-1. Question: list the names of products in the ''footwear'' category, ordered by price ascending. Return exactly one column named name. Submission and grading: same as agent-skill-sql-1.","settlementSource":"Agent''s own submitted query, run server-side against a fixed, read-only sandbox dataset","verificationMethod":"deterministic"}'::jsonb,
  encode(digest('{"name":"Agent Skill: SQL — cheapest footwear first","category":"skill","kind":"sql","description":"Same skill_sandbox schema as agent-skill-sql-1. Question: list the names of products in the ''footwear'' category, ordered by price ascending. Return exactly one column named name. Submission and grading: same as agent-skill-sql-1.","settlementSource":"Agent''s own submitted query, run server-side against a fixed, read-only sandbox dataset","verificationMethod":"deterministic"}'::jsonb::text, 'sha256'), 'hex'),
  'deterministic'
),
(
  'agent-skill-sql-3',
  'skill',
  'Agent Skill: SQL — total quantity per customer',
  '{"name":"Agent Skill: SQL — total quantity per customer","category":"skill","kind":"sql","description":"Same skill_sandbox schema as agent-skill-sql-1. Question: for each customer, compute the total quantity of items across all their orders. Return exactly two columns named name and total_quantity, ordered by total_quantity descending, then name ascending for ties. Include every customer, even ones with zero quantity. Submission and grading: same as agent-skill-sql-1.","settlementSource":"Agent''s own submitted query, run server-side against a fixed, read-only sandbox dataset","verificationMethod":"deterministic"}'::jsonb,
  encode(digest('{"name":"Agent Skill: SQL — total quantity per customer","category":"skill","kind":"sql","description":"Same skill_sandbox schema as agent-skill-sql-1. Question: for each customer, compute the total quantity of items across all their orders. Return exactly two columns named name and total_quantity, ordered by total_quantity descending, then name ascending for ties. Include every customer, even ones with zero quantity. Submission and grading: same as agent-skill-sql-1.","settlementSource":"Agent''s own submitted query, run server-side against a fixed, read-only sandbox dataset","verificationMethod":"deterministic"}'::jsonb::text, 'sha256'), 'hex'),
  'deterministic'
),
(
  'agent-skill-sql-4',
  'skill',
  'Agent Skill: SQL — top products by revenue',
  '{"name":"Agent Skill: SQL — top products by revenue","category":"skill","kind":"sql","description":"Same skill_sandbox schema as agent-skill-sql-1. Question: list product names where total revenue (sum of price_usd * quantity across order_items) exceeds 100, ordered by total revenue descending. Return exactly two columns named name and total_revenue. Submission and grading: same as agent-skill-sql-1.","settlementSource":"Agent''s own submitted query, run server-side against a fixed, read-only sandbox dataset","verificationMethod":"deterministic"}'::jsonb,
  encode(digest('{"name":"Agent Skill: SQL — top products by revenue","category":"skill","kind":"sql","description":"Same skill_sandbox schema as agent-skill-sql-1. Question: list product names where total revenue (sum of price_usd * quantity across order_items) exceeds 100, ordered by total revenue descending. Return exactly two columns named name and total_revenue. Submission and grading: same as agent-skill-sql-1.","settlementSource":"Agent''s own submitted query, run server-side against a fixed, read-only sandbox dataset","verificationMethod":"deterministic"}'::jsonb::text, 'sha256'), 'hex'),
  'deterministic'
),
(
  'agent-skill-sql-5',
  'skill',
  'Agent Skill: SQL — customers who never bought accessories',
  '{"name":"Agent Skill: SQL — customers who never bought accessories","category":"skill","kind":"sql","description":"Same skill_sandbox schema as agent-skill-sql-1. Question: list the names of customers who have never ordered any product in the ''accessories'' category. Return exactly one column named name. Submission and grading: same as agent-skill-sql-1.","settlementSource":"Agent''s own submitted query, run server-side against a fixed, read-only sandbox dataset","verificationMethod":"deterministic"}'::jsonb,
  encode(digest('{"name":"Agent Skill: SQL — customers who never bought accessories","category":"skill","kind":"sql","description":"Same skill_sandbox schema as agent-skill-sql-1. Question: list the names of customers who have never ordered any product in the ''accessories'' category. Return exactly one column named name. Submission and grading: same as agent-skill-sql-1.","settlementSource":"Agent''s own submitted query, run server-side against a fixed, read-only sandbox dataset","verificationMethod":"deterministic"}'::jsonb::text, 'sha256'), 'hex'),
  'deterministic'
)
on conflict (slug) do nothing;

insert into skill_sql_answers (challenge_id, expected_result)
select id, '[{"name":"Ava Stone"},{"name":"Noah King"}]'::jsonb from auevo_challenges where slug = 'agent-skill-sql-1'
on conflict (challenge_id) do nothing;

insert into skill_sql_answers (challenge_id, expected_result)
select id, '[{"name":"Merino Socks (3-pack)"},{"name":"Trail Runner Shoes"}]'::jsonb from auevo_challenges where slug = 'agent-skill-sql-2'
on conflict (challenge_id) do nothing;

insert into skill_sql_answers (challenge_id, expected_result)
select id, '[{"name":"Ava Stone","total_quantity":6},{"name":"Noah King","total_quantity":4},{"name":"Liu Wei","total_quantity":2},{"name":"Mia Fischer","total_quantity":2},{"name":"Omar Haddad","total_quantity":2}]'::jsonb
from auevo_challenges where slug = 'agent-skill-sql-3'
on conflict (challenge_id) do nothing;

insert into skill_sql_answers (challenge_id, expected_result)
select id, '[{"name":"Rain Shell Jacket","total_revenue":300},{"name":"Trail Runner Shoes","total_revenue":240},{"name":"Commuter Backpack","total_revenue":170},{"name":"City Bike Helmet","total_revenue":120},{"name":"Merino Socks (3-pack)","total_revenue":110}]'::jsonb
from auevo_challenges where slug = 'agent-skill-sql-4'
on conflict (challenge_id) do nothing;

insert into skill_sql_answers (challenge_id, expected_result)
select id, '[{"name":"Noah King"}]'::jsonb from auevo_challenges where slug = 'agent-skill-sql-5'
on conflict (challenge_id) do nothing;
